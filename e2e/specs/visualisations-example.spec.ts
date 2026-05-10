import { test, expect } from '@playwright/test'
import {
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

/** Staging must serve `public/Examples` + Pyodide bootstrap from the same packaged build (redeploy after notebook/kernel changes). */
test.describe('@regression examples', () => {
  test('@slow Visualisations example: Run All completes without cell errors', async ({ page }) => {
    test.setTimeout(600_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)

    await openBundledExample(nb, 'Visualisations.ipynb')
    await nb.locator('.nb-tab-title').filter({ hasText: 'Visualisations' }).waitFor({
      state: 'visible',
      timeout: 90_000,
    })

    await waitForKernelReady(nb, 360_000)

    const runAll = nb.getByRole('button', { name: /Run All/ })
    await expect(runAll).toBeEnabled({ timeout: 60_000 })
    await runAll.click()

    await expect(nb.locator('.nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 540_000,
    })

    await expect(nb.locator('.nb-output-error')).toHaveCount(0)

    await expect(nb.locator('.nb-mime-plotly').first()).toBeVisible({ timeout: 120_000 })
  })
})
