import { expect, type Frame, type Locator, type Page } from '@playwright/test'

const SHELL_SELECTOR = '[data-testid="notebook-app-root"], .nb-app-frame'

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function findVisibleShell(
  page: Page,
  timeoutMs: number,
): Promise<{ frame: Frame; shell: Locator }> {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    for (const frame of page.frames()) {
      const shell = frame.locator(SHELL_SELECTOR).first()
      if (await shell.isVisible().catch(() => false)) {
        return { frame, shell }
      }
    }
    await delay(300)
  }
  throw new Error(`Notebook shell (${SHELL_SELECTOR}) not visible within ${timeoutMs}ms`)
}

/**
 * Resolves the notebook shell inside whichever frame hosts it (catalog iframe layout
 * varies by tenant; `src` may not include `app-ui`). Falls back to `.nb-app-frame` when
 * older deployments omit `data-testid`.
 */
export async function waitForAppShell(page: Page, timeoutMs = 120_000): Promise<Locator> {
  const { shell } = await findVisibleShell(page, timeoutMs)
  return shell
}

/** Frame containing the notebook DOM (same-origin widget iframe or top-level in dev). */
export async function getNotebookFrame(page: Page, timeoutMs = 120_000): Promise<Frame> {
  const { frame } = await findVisibleShell(page, timeoutMs)
  return frame
}

export function stagingStartUrl(): string {
  const base = process.env.CRIBL_E2E_BASE_URL?.replace(/\/$/, '')
  if (!base) {
    throw new Error('Set CRIBL_E2E_BASE_URL in e2e/.env (see e2e/.env.example)')
  }
  const override = process.env.CRIBL_E2E_START_URL?.trim()
  if (override) return override
  const startPath = process.env.CRIBL_E2E_START_PATH ?? '/apps'
  const pathPart = startPath.startsWith('/') ? startPath : `/${startPath}`
  return `${base}${pathPart}`
}

/**
 * Lands on the notebook widget: honors CRIBL_E2E_APP_PACK_PATH, else opens START_URL then
 * clicks the installed pack row on `/apps` when the shell is not already visible.
 */
export async function navigateToStagingNotebookApp(page: Page): Promise<void> {
  const base = process.env.CRIBL_E2E_BASE_URL?.replace(/\/$/, '')
  if (!base) {
    throw new Error('Set CRIBL_E2E_BASE_URL in e2e/.env (see e2e/.env.example)')
  }
  const packPath = process.env.CRIBL_E2E_APP_PACK_PATH?.trim()

  if (packPath) {
    const p = packPath.startsWith('/') ? packPath : `/${packPath}`
    await page.goto(`${base}${p}`)
    await page.waitForLoadState('domcontentloaded')
    // Pack URLs embed the widget iframe; cold loads regularly exceed the default 120s shell timeout on staging.
    await waitForAppShell(page, 240_000)
    return
  }

  await page.goto(stagingStartUrl())

  try {
    await waitForAppShell(page, 25_000)
    return
  } catch {
    /* e.g. START_PATH=/apps — catalog has no widget yet */
  }

  const substr = process.env.CRIBL_E2E_APP_PACK_SUBSTRING?.trim() || 'notebook-app'
  const link = page.locator(`a[href^="/apps/a/"][href*="${substr}"]`).first()
  await link.click({ timeout: 45_000 })
  await page.waitForLoadState('load')
  await waitForAppShell(page, 240_000)
}

/** `.nb-page` inside the notebook shell (expects navigation to the widget already completed). */
export async function notebookChromeScope(page: Page, timeoutMs = 180_000): Promise<Locator> {
  const findTimeout = Math.min(timeoutMs, 120_000)
  const { frame } = await findVisibleShell(page, findTimeout)
  const chrome = frame.locator('.nb-page').first()
  await chrome.waitFor({ state: 'visible', timeout: timeoutMs })
  return chrome
}

/** Welcome page: select a bundled ``*.ipynb`` by filename and open it in a new tab. */
export async function openBundledExample(nb: Frame, filename: string): Promise<void> {
  const select = nb.locator('#nb-welcome-examples-select')
  await select.waitFor({ state: 'visible', timeout: 120_000 })
  await select.selectOption(filename)
  const openBtn = nb.getByRole('button', { name: 'Open example' })
  await expect(openBtn).toBeEnabled({ timeout: 120_000 })
  await openBtn.click()
}

/** Pyodide finished loading; code cells can run. */
/**
 * Cell error headers render as `{ename}: {evalue}` (see `CellOutput.tsx`).
 * Micropip, packaging, and PyPI Simple parsers often surface **warnings** as IOPub `error`
 * messages with exception types ending in `Warning`, which should not fail staging regression.
 */
/** Exception type from a cell error header (`{ename}: {evalue}`). */
export function notebookCellErrorEname(header: string): string {
  const trimmed = header.trim()
  const colon = trimmed.indexOf(':')
  const enamePart = (colon >= 0 ? trimmed.slice(0, colon) : trimmed).trim()
  return enamePart.includes('.') ? enamePart.replace(/^.*\./, '') : enamePart
}

export function isBenignNotebookCellErrorHeader(header: string): boolean {
  const ename = notebookCellErrorEname(header)
  return ename === 'Warning' || ename.endsWith('Warning')
}

function isCriticalNotebookCellErrorHeader(
  header: string,
  allowedEnames: ReadonlySet<string>,
): boolean {
  if (isBenignNotebookCellErrorHeader(header)) return false
  if (allowedEnames.has(notebookCellErrorEname(header))) return false
  return true
}

export type ExpectNoCriticalNotebookErrorsOptions = {
  timeoutMs?: number
  /** Example notebooks may include deliberate failures (e.g. AI debugging demos). */
  allowedEnames?: readonly string[]
}

/** Fails only when a cell has a structured error whose type is not allowed or a Warning subclass. */
export async function expectNoCriticalNotebookErrors(
  nb: Frame,
  options: ExpectNoCriticalNotebookErrorsOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 60_000
  const allowedEnames = new Set(options.allowedEnames ?? [])
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const headers = await nb.locator('.nb-output-error-header').allInnerTexts()
    const critical = headers.filter((h) => isCriticalNotebookCellErrorHeader(h, allowedEnames))
    if (critical.length === 0) return
    await delay(250)
  }
  const headers = await nb.locator('.nb-output-error-header').allInnerTexts()
  const critical = headers.filter((h) => isCriticalNotebookCellErrorHeader(h, allowedEnames))
  throw new Error(
    `Expected no critical notebook cell errors; got ${critical.length}: ${critical.map((c) => c.split('\n')[0]?.trim() ?? c).join(' | ')}`,
  )
}

/** Pyodide finished loading; code cells can run. */
export async function waitForKernelReady(nb: Frame, timeoutMs = 180_000): Promise<void> {
  // Scope to toolbar — avoids any stray markup and matches the active tab's kernel strip.
  const ready = nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })
  const failedBanner = nb.getByRole('alert').filter({ hasText: 'Kernel failed to load' })
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    if (await ready.isVisible().catch(() => false)) return
    if (await failedBanner.isVisible().catch(() => false)) {
      const summary = await nb.locator('.nb-kernel-banner-message').first().innerText().catch(() => '')
      throw new Error(`Kernel failed to reach Ready: ${summary.trim() || '(no summary)'}`)
    }
    await delay(250)
  }
  throw new Error(`Kernel did not reach Ready within ${timeoutMs}ms`)
}

/** Replace source of the first code cell’s editor (scoped so extra cells do not steal focus). */
export async function fillFirstCodeCell(page: Page, nb: Frame, source: string): Promise<void> {
  const editor = nb.locator('.nb-cell').first().locator('.cm-content').first()
  await editor.waitFor({ state: 'visible', timeout: 90_000 })
  await editor.click()
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${mod}+A`)
  await page.keyboard.press('Backspace')
  await page.keyboard.insertText(source)
}

export async function clickRunFirstCodeCell(nb: Frame): Promise<void> {
  const run = nb.locator('.nb-cell').first().getByTitle('Run cell (Shift+Enter)')
  await expect(run).toBeEnabled({ timeout: 30_000 })
  await run.click()
}
