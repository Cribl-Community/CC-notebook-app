/**
 * One-off: open Threat Hunting Playbook on staging and run first externaldata cell.
 * Uses e2e/.auth/storageState.json (gitignored).
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '../e2e/.env') })

const storagePath = path.join(__dirname, '../e2e/.auth/storageState.json')
const base = process.env.CRIBL_E2E_BASE_URL?.replace(/\/$/, '')
const packPath = process.env.CRIBL_E2E_APP_PACK_PATH ?? '/apps/a/jupyter-notebook-app-e2e-test'

if (!base) {
  console.error('Set CRIBL_E2E_BASE_URL in e2e/.env')
  process.exit(1)
}

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

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ storageState: storagePath, ignoreHTTPSErrors: true })
  const page = await context.newPage()

  await page.goto(`${base}${packPath.startsWith('/') ? packPath : `/${packPath}`}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  })
  const nb = await findFrame(page)

  const select = nb.locator('#nb-welcome-examples-select')
  await select.waitFor({ state: 'visible', timeout: 120_000 })
  await select.selectOption('Threat_Hunting_Playbook.ipynb')
  await nb.getByRole('button', { name: 'Open example' }).click()

  await nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true }).waitFor({
    state: 'visible',
    timeout: 300_000,
  })

  // First code cell with %%cribl_search (skip markdown)
  const searchCell = nb.locator('.nb-cell').filter({ hasText: '%%cribl_search' }).first()
  await searchCell.waitFor({ state: 'visible', timeout: 60_000 })
  const network = []
  page.on('response', async (res) => {
    const url = res.url()
    if (/search|externaldata|jobs|api\/v1/i.test(url) && res.request().method() !== 'OPTIONS') {
      let body = ''
      try {
        body = (await res.text()).slice(0, 2000)
      } catch {
        body = '(unreadable)'
      }
      network.push({ status: res.status(), url: url.slice(0, 240), body })
    }
  })

  const runBtn = searchCell.getByTitle('Run cell (Shift+Enter)')
  await runBtn.click()

  // Wait for Cribl Search UI terminal state (not just kernel Ready — job can outlast poll budget)
  const failed = searchCell.locator('.nb-cribl-status--failed')
  const completed = searchCell.locator('.nb-cribl-status--ok')
  const deadline = Date.now() + 600_000
  let terminal = 'timeout'
  while (Date.now() < deadline) {
    if (await failed.isVisible().catch(() => false)) {
      terminal = 'failed'
      break
    }
    if (await completed.isVisible().catch(() => false)) {
      terminal = 'completed'
      break
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  console.log('=== TERMINAL STATE ===', terminal)

  const errors = await nb.locator('.nb-output-error-header').allInnerTexts()
  const stderr = await searchCell.locator('.nb-output-stream.stderr, .nb-output-text.stderr').allInnerTexts().catch(() => [])
  const failMsg = await searchCell.locator('.nb-cribl-fail-msg').innerText().catch(() => '')
  const criblUi = await searchCell.locator('.nb-cribl-root').innerText().catch(() => '')
  const stdout = await searchCell.locator('.nb-output-stream.stdout, .nb-output-text').allInnerTexts().catch(() => [])

  console.log('=== NETWORK (search-related) ===')
  console.log(JSON.stringify(network, null, 2))

  console.log('=== CELL ERRORS ===')
  console.log(errors.length ? errors.join('\n---\n') : '(none)')
  console.log('=== STDERR IN CELL ===')
  console.log(stderr.join('\n') || '(none)')
  console.log('=== CRIBL SEARCH FAIL MESSAGE ===')
  console.log(failMsg || '(none)')
  console.log('=== CRIBL SEARCH UI ===')
  console.log(criblUi || '(none)')
  console.log('=== OTHER OUTPUT (truncated) ===')
  console.log(stdout.map((t) => t.slice(0, 500)).join('\n---\n') || '(none)')

  await page.screenshot({ path: '/tmp/threat-hunt-search-fail.png', fullPage: true })
  console.log('Screenshot: /tmp/threat-hunt-search-fail.png')

  await browser.close()
  process.exit(errors.length > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(2)
})
