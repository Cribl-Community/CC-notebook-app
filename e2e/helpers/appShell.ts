import type { Locator, Page } from '@playwright/test'

/**
 * The notebook widget runs inside a Cribl Apps iframe whose src typically contains `app-ui`.
 * When running standalone (local dev), the shell is in the top document.
 */
export async function waitForAppShell(page: Page): Promise<Locator> {
  const iframe = page.locator('iframe[src*="app-ui"]').first()
  const iframeVisible = await iframe.isVisible().catch(() => false)

  const root = iframeVisible
    ? page.frameLocator('iframe[src*="app-ui"]').first().getByTestId('notebook-app-root')
    : page.getByTestId('notebook-app-root')

  await root.waitFor({ state: 'visible', timeout: 120_000 })
  return root
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
