import { test, expect } from '@playwright/test'
import {
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

/**
 * Requires a tenant where Cribl Search works from the app (`%%cribl_search` + externaldata).
 * First-time micropip (SciPy, sklearn, Plotly, PyOD) can take tens of minutes — timeouts are high.
 */
test.describe('@regression examples', () => {
  test.describe.configure({ retries: 1 })

  /** `@heavy`: huge micropip + Search surface; run after other `@slow` specs can trip pack-proxy limits — use `npm run e2e:slow:all`. */
  test('@slow @heavy Anomaly Detection PyOD example: Run All completes without cell errors', async ({ page }) => {
    test.setTimeout(2_400_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)

    await openBundledExample(nb, 'Anomaly_Detection_PyOD.ipynb')
    await nb.locator('.nb-tab-title').filter({ hasText: 'Anomaly Detection PyOD' }).waitFor({
      state: 'visible',
      timeout: 90_000,
    })

    await waitForKernelReady(nb, 480_000)

    const runAll = nb.getByRole('button', { name: /Run All/ })
    await expect(runAll).toBeEnabled({ timeout: 60_000 })
    await runAll.click()

    await expect(nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 2_100_000,
    })

    await expect(nb.locator('.nb-output-error')).toHaveCount(0)

    await expect(nb.locator('.nb-mime-plotly').first()).toBeVisible({ timeout: 300_000 })
  })
})
