import { test, expect } from '@playwright/test'
import {
  clickRunFirstCodeCell,
  fillFirstCodeCell,
  getNotebookFrame,
  navigateToStagingNotebookApp,
  waitForKernelReady,
} from '../helpers/appShell'

/**
 * Exercises kernel-side `%pip` / `!pip` line rewriting (no PyPI fetch).
 * Full `micropip.install` / auto-import paths need network and stay manual smoke
 * items (see docs/PYODIDE_CUSTOMIZATIONS.md).
 */
test.describe('@regression pip magic', () => {
  test('@slow unsupported %pip and !pip subcommands print install hints on stderr', async ({ page }) => {
    test.setTimeout(420_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)
    await nb.getByRole('button', { name: 'New notebook', exact: true }).click()
    await nb.locator('.nb-tab-title').filter({ hasText: 'Untitled' }).waitFor({ state: 'visible', timeout: 60_000 })
    await waitForKernelReady(nb, 300_000)

    const stderr = nb.locator('.nb-cell').first().locator('.nb-output-pre.nb-output-stream--stderr')

    await fillFirstCodeCell(page, nb, '%pip freeze')
    await clickRunFirstCodeCell(nb)
    await expect(stderr.filter({ hasText: /got freeze/ })).toBeVisible({ timeout: 60_000 })

    await fillFirstCodeCell(page, nb, '!pip list')
    await clickRunFirstCodeCell(nb)
    // Re-running the cell replaces prior outputs; only the latest stderr remains.
    await expect(stderr.filter({ hasText: /got list/ })).toBeVisible({ timeout: 60_000 })
  })
})
