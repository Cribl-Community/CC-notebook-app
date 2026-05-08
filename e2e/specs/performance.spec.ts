import { test, expect } from '@playwright/test'
import { stagingStartUrl, waitForAppShell } from '../helpers/appShell'

test.describe('@performance', () => {
  test('time-to-visible shell within budget', async ({ page }) => {
    const budget = Number(process.env.CRIBL_E2E_PERF_SHELL_MS ?? '120000')
    const t0 = Date.now()
    await page.goto(stagingStartUrl())
    await waitForAppShell(page)
    const elapsed = Date.now() - t0
    expect.soft(elapsed, `shell visible in ${elapsed}ms (budget ${budget}ms)`).toBeLessThanOrEqual(budget)
  })
})
