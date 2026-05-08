import { test, expect } from '@playwright/test'
import { navigateToStagingNotebookApp, notebookChromeScope, waitForAppShell } from '../helpers/appShell'

test.describe('@smoke @regression', () => {
  test('notebook shell mounts', async ({ page }) => {
    await navigateToStagingNotebookApp(page)
    const root = await waitForAppShell(page)
    await expect(root).toBeVisible()
  })

  test('notebook chrome renders inside shell', async ({ page }) => {
    await navigateToStagingNotebookApp(page)
    const chrome = await notebookChromeScope(page)
    await expect(chrome).toBeVisible({ timeout: 180_000 })
  })
})
