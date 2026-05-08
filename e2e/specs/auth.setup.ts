import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import tty from 'node:tty'
import { fileURLToPath } from 'node:url'
import { mkdir, stat, unlink } from 'node:fs/promises'
import { test as setup } from '@playwright/test'
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

  await page.context().storageState({ path: out })
})
