import type { Frame, Locator, Page } from '@playwright/test'

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
    await waitForAppShell(page)
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
  await waitForAppShell(page)
}

/** `.nb-page` inside the notebook shell (expects navigation to the widget already completed). */
export async function notebookChromeScope(page: Page, timeoutMs = 180_000): Promise<Locator> {
  const findTimeout = Math.min(timeoutMs, 120_000)
  const { frame } = await findVisibleShell(page, findTimeout)
  const chrome = frame.locator('.nb-page').first()
  await chrome.waitFor({ state: 'visible', timeout: timeoutMs })
  return chrome
}
