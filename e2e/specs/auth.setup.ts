import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import tty from 'node:tty'
import { fileURLToPath } from 'node:url'
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises'
import { test as setup, type Page } from '@playwright/test'
import { stagingStartUrl } from '../helpers/appShell'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const e2eRoot = path.join(__dirname, '..')

/** Sentinel: create this file after login when Enter does not reach Node (npm/playwright stdin quirks). */
const LOGIN_SENTINEL = 'login-complete'

async function waitForSentinelFile(sentinelPath: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      await stat(sentinelPath)
      await unlink(sentinelPath).catch(() => {})
      return
    } catch {
      await new Promise((r) => setTimeout(r, 400))
    }
  }
  throw new Error(`Timeout waiting for ${sentinelPath}`)
}

function openControllingTTY(): tty.ReadStream | undefined {
  if (process.platform === 'win32') return undefined
  try {
    const fd = fs.openSync('/dev/tty', 'rs')
    return new tty.ReadStream(fd)
  } catch {
    return undefined
  }
}

/**
 * Playwright/npm often leave `process.stdin` non-interactive; read from `/dev/tty` on macOS/Linux.
 */
async function waitForEnter(linePrompt: string): Promise<void> {
  let stream: NodeJS.ReadableStream = process.stdin
  let ownsStream = false

  if (process.stdin.isTTY) {
    stream = process.stdin
  } else {
    const ttyStream = openControllingTTY()
    if (ttyStream) {
      stream = ttyStream
      ownsStream = true
    }
  }

  await new Promise<void>((resolve, reject) => {
    const rl = readline.createInterface({
      input: stream,
      output: process.stdout,
      terminal: true,
    })
    const onSigint = () => {
      process.off('SIGINT', onSigint)
      rl.close()
      if (ownsStream) ttyStreamDestroy(stream)
      reject(new Error('Interrupted'))
    }
    const done = () => {
      process.off('SIGINT', onSigint)
      rl.close()
      if (ownsStream) ttyStreamDestroy(stream)
      resolve()
    }
    process.once('SIGINT', onSigint)
    rl.question(linePrompt, () => done())
  })
}

function ttyStreamDestroy(s: NodeJS.ReadableStream): void {
  try {
    ;(s as tty.ReadStream).destroy()
  } catch {
    /* ignore */
  }
}

function leaderOriginFromEnv(): URL | null {
  const base = process.env.CRIBL_E2E_BASE_URL?.replace(/\/$/, '').trim()
  if (!base) return null
  try {
    return new URL(base)
  } catch {
    return null
  }
}

/**
 * Observes same-origin /api/v1/* requests after login and keeps the latest Bearer access token
 * (same header the UI sends) for `npm run deploy:staging`.
 */
function armBearerCaptureForDeploy(page: Page): {
  getToken: () => string | undefined
} {
  let captured: string | undefined
  const leader = leaderOriginFromEnv()
  if (!leader) {
    return { getToken: () => captured }
  }

  page.on('request', (request) => {
    let reqUrl: URL
    try {
      reqUrl = new URL(request.url())
    } catch {
      return
    }
    if (reqUrl.origin !== leader.origin) return
    if (!reqUrl.pathname.startsWith('/api/v1/')) return
    const auth = request.headers()['authorization']
    if (!auth?.startsWith('Bearer ')) return
    const raw = auth.slice('Bearer '.length).trim()
    if (raw.length >= 32) captured = raw
  })

  return { getToken: () => captured }
}

async function delay(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

async function waitForManualLoginDone(authDir: string, linePrompt: string): Promise<void> {
  const sentinelPath = path.join(authDir, LOGIN_SENTINEL)
  await unlink(sentinelPath).catch(() => {})

  console.log(
    `\nAfter logging in the browser window:\n` +
      `  • Press Enter in this terminal, or\n` +
      `  • Run: touch "${sentinelPath}"\n`,
  )

  await Promise.race([
    waitForEnter(linePrompt),
    waitForSentinelFile(sentinelPath, 3600_000),
  ])
}

setup('save staging session', async ({ page }) => {
  const authDir = path.join(e2eRoot, '.auth')
  await mkdir(authDir, { recursive: true })
  const out =
    process.env.CRIBL_E2E_STORAGE_STATE?.trim() ||
    path.join(authDir, 'storageState.json')

  const { getToken } = armBearerCaptureForDeploy(page)

  await page.goto(stagingStartUrl())

  const selector = process.env.CRIBL_E2E_POST_LOGIN_SELECTOR?.trim()
  if (selector) {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 300_000 })
  } else {
    await waitForManualLoginDone(
      authDir,
      'Press Enter here when logged in (or use touch sentinel above)… ',
    )
  }

  let bearer = getToken()
  if (!bearer && leaderOriginFromEnv()) {
    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
    for (let i = 0; i < 40 && !bearer; i++) {
      await delay(500)
      bearer = getToken()
    }
  }

  if (bearer) {
    const credPath = path.join(authDir, 'captured-credentials.env')
    await writeFile(
      credPath,
      [
        '# Generated by npm run e2e:auth. Gitignored — do not commit.',
        `CRIBL_API_TOKEN=${bearer}`,
        '',
      ].join('\n'),
      { encoding: 'utf8', mode: 0o600 },
    )
    console.log(`\nSaved CRIBL_API_TOKEN for deploy:staging → ${credPath}`)
  } else if (leaderOriginFromEnv()) {
    console.warn(
      '\nCould not capture a Bearer token from leader /api/v1/* requests.\n' +
        'Set CRIBL_API_TOKEN manually in e2e/.env for deploy, or complete login until /apps loads API traffic.',
    )
  }

  await page.context().storageState({ path: out })
})
