/**
 * Run All on Threat_Hunting_Playbook.ipynb; report per-cell failures.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../e2e/.env') })
dotenv.config({ path: path.join(__dirname, '../e2e/.auth/captured-credentials.env') })

const storagePath = path.join(__dirname, '../e2e/.auth/storageState.json')
const base = process.env.CRIBL_E2E_BASE_URL?.replace(/\/$/, '')
const packPath = process.env.CRIBL_E2E_APP_PACK_PATH?.trim()

const SHELL = '[data-testid="notebook-app-root"], .nb-app-frame'

async function findFrame(page) {
  const end = Date.now() + 240_000
  while (Date.now() < end) {
    for (const frame of page.frames()) {
      const shell = frame.locator(SHELL).first()
      if (await shell.isVisible().catch(() => false)) return frame
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('shell not found')
}

async function navigate(page) {
  if (packPath) {
    await page.goto(`${base}${packPath.startsWith('/') ? packPath : `/${packPath}`}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120_000,
    })
    return
  }
  await page.goto(`${base}${process.env.CRIBL_E2E_START_PATH ?? '/apps'}`)
  const link = page.locator(`a[href^="/apps/a/"][href*="notebook-app"]`).first()
  await link.click({ timeout: 45_000 })
  await page.waitForLoadState('load')
}

async function main() {
  if (!base) {
    console.error('Set CRIBL_E2E_BASE_URL')
    process.exit(1)
  }

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: storagePath, ignoreHTTPSErrors: true })
  const page = await context.newPage()
  await navigate(page)
  const nb = await findFrame(page)

  await nb.locator('#nb-welcome-examples-select').waitFor({ state: 'visible', timeout: 120_000 })
  await nb.locator('#nb-welcome-examples-select').selectOption('Threat_Hunting_Playbook.ipynb')
  await nb.getByRole('button', { name: 'Open example' }).click()

  await nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true }).waitFor({
    state: 'visible',
    timeout: 300_000,
  })

  await nb.getByRole('button', { name: /Run All/ }).click()
  await nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true }).waitFor({
    state: 'visible',
    timeout: 900_000,
  })

  const cells = nb.locator('.nb-main .nb-cell')
  const n = await cells.count()
  const problems = []

  for (let i = 0; i < n; i++) {
    const cell = cells.nth(i)
    const src =
      (await cell.locator('.cm-content').innerText().catch(() => '')) ||
      (await cell.locator('textarea').inputValue().catch(() => ''))
    const preview = src.split('\n').slice(0, 2).join(' | ').slice(0, 100)

    const failed = await cell.locator('.nb-cribl-status--failed').isVisible().catch(() => false)
    const pyErrors = await cell.locator('.nb-output-error-header').allInnerTexts()
    const failMsg = await cell.locator('.nb-cribl-fail-msg').innerText().catch(() => '')
    const stderr = await cell.locator('.nb-output-stream.stderr').innerText().catch(() => '')

    if (failed || pyErrors.length || /Error|Traceback/i.test(stderr)) {
      problems.push({ i, preview, failed, pyErrors, failMsg: failMsg.slice(0, 1200), stderr: stderr.slice(0, 500) })
    }
  }

  console.log(JSON.stringify(problems, null, 2))
  console.log(`cells=${n} problems=${problems.length}`)
  await browser.close()
  process.exit(problems.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
