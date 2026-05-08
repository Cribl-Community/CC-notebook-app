import { test, expect } from '@playwright/test'
import { navigateToStagingNotebookApp } from '../helpers/appShell'

test.describe('@performance', () => {
  test('time-to-visible shell within budget', async ({ page }) => {
    const budget = Number(process.env.CRIBL_E2E_PERF_SHELL_MS ?? '180000')
    const t0 = Date.now()
    await navigateToStagingNotebookApp(page)
    const elapsed = Date.now() - t0
    expect.soft(elapsed, `shell visible in ${elapsed}ms (budget ${budget}ms)`).toBeLessThanOrEqual(budget)
  })
})
