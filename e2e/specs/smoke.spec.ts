import { test, expect } from '@playwright/test'
import { stagingStartUrl, waitForAppShell } from '../helpers/appShell'

test.describe('@smoke @regression', () => {
  test('notebook shell mounts', async ({ page }) => {
    await page.goto(stagingStartUrl())
    const root = await waitForAppShell(page)
    await expect(root).toBeVisible()
  })

  test('notebook chrome renders inside shell', async ({ page }) => {
    await page.goto(stagingStartUrl())
    await waitForAppShell(page)
    const iframe = page.locator('iframe[src*="app-ui"]').first()
    const scope = (await iframe.isVisible().catch(() => false))
      ? page.frameLocator('iframe[src*="app-ui"]').first()
      : page
    await expect(scope.getByTestId('notebook-app-root').locator('.nb-page')).toBeVisible({
      timeout: 180_000,
    })
  })
})
