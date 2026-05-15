import { test, expect } from '@playwright/test'
import {
  expectNoCriticalNotebookErrors,
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

/**
 * Staging tenant must support Cribl Search (`%%cribl_search`), lookup REST under
 * `default_search`, and PyPI/micropip for the pinned `cribl-control-plane` stack.
 */
test.describe('@regression examples', () => {
  test.describe.configure({ retries: 2 })

  test('@slow Cribl Search Lookup Magics example: Run All completes without cell errors', async ({
    page,
  }) => {
    test.setTimeout(900_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)

    await openBundledExample(nb, 'Cribl_Search_Lookup_Magics.ipynb')
    await nb.locator('.nb-tab-title').filter({ hasText: 'Cribl Search Lookup Magics' }).waitFor({
      state: 'visible',
      timeout: 90_000,
    })

    await waitForKernelReady(nb, 480_000)

    const runAll = nb.getByRole('button', { name: /Run All/ })
    await expect(runAll).toBeEnabled({ timeout: 60_000 })
    await runAll.click()

    await expect(nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 600_000,
    })

    await expectNoCriticalNotebookErrors(nb)
  })
})
