import { test, expect } from '@playwright/test'
import {
  expectNoCriticalNotebookErrors,
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

/**
 * Requires a tenant where Cribl Search works from the app (`%%cribl_search` + externaldata) and a
 * packaged build that bundles `Process_Lineage_Sigma_Hunt.ipynb`. Loads hosted Windows telemetry
 * CSVs, traces process lineage, and renders a networkx kill-chain (matplotlib PNG) + rarity charts.
 * Not `@heavy`: networkx ships in the Pyodide lockfile (no large micropip stack).
 */
test.describe('@regression examples', () => {
  // Match zz-anomaly-detection-example.spec.ts (Search + externaldata Run All; not micropip-heavy).
  test.describe.configure({ retries: 1 })

  test('@slow Process Lineage Sigma Hunt example: Run All completes without cell errors', async ({
    page,
  }) => {
    test.setTimeout(1_200_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)

    await openBundledExample(nb, 'Process_Lineage_Sigma_Hunt.ipynb')
    await nb.locator('.nb-tab-title').filter({ hasText: 'Process Lineage Sigma Hunt' }).waitFor({
      state: 'visible',
      timeout: 90_000,
    })

    await waitForKernelReady(nb, 480_000)

    const runAll = nb.getByRole('button', { name: /Run All/ })
    await expect(runAll).toBeEnabled({ timeout: 60_000 })
    await runAll.click()

    await expect(nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 900_000,
    })

    await expectNoCriticalNotebookErrors(nb)

    // The lineage kill-chain and rarity charts render as matplotlib PNG (`nb-mime-image`).
    await expect(nb.locator('.nb-mime-image').first()).toBeVisible({ timeout: 300_000 })
  })
})
