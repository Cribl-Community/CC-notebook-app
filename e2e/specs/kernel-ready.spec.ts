import { test, expect } from '@playwright/test'
import { getNotebookFrame, navigateToStagingNotebookApp, waitForKernelReady } from '../helpers/appShell'

/** Runs before heavier `@slow` specs — filename sorts before `pip-magic` / `visualisations`. */
test.describe('@regression kernel', () => {
  test.describe.configure({ retries: 2 })

  test('@slow Pyodide kernel reaches Ready after opening a notebook tab', async ({ page }) => {
    test.setTimeout(720_000)

    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)
    await nb.locator('button.nb-tab-new').click()
    await expect(nb.getByRole('textbox', { name: 'Notebook title' })).toHaveValue('Untitled', {
      timeout: 90_000,
    })
    await waitForKernelReady(nb, 480_000)
  })
})
