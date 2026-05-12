import { test, expect } from '@playwright/test'
import {
  expectNoCriticalNotebookErrors,
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

test.describe('@regression examples', () => {
  test.describe.configure({ retries: 3 })

  test('@slow Widgets demo: Run All shows interactive widget chrome', async ({ page }) => {
    test.setTimeout(600_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)

    await openBundledExample(nb, 'Widgets_Demo.ipynb')
    await nb.locator('.nb-tab-title').filter({ hasText: 'Widgets Demo' }).waitFor({
      state: 'visible',
      timeout: 90_000,
    })

    await waitForKernelReady(nb, 480_000)

    const runAll = nb.getByRole('button', { name: /Run All/ })
    await expect(runAll).toBeEnabled({ timeout: 60_000 })
    await runAll.click()

    await expect(nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
      timeout: 180_000,
    })

    await expectNoCriticalNotebookErrors(nb)

    const host = nb.getByTestId('jupyter-widget-host')
    await expect(host).toBeVisible({ timeout: 120_000 })
    await expect(host.locator('.jupyter-widgets.widget-slider')).toBeVisible({ timeout: 60_000 })
  })
})
