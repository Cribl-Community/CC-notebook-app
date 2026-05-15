import { test, expect } from '@playwright/test'
import { getNotebookFrame, navigateToStagingNotebookApp } from '../helpers/appShell'

test.describe('@regression welcome', () => {
  test('hero, sidebar, and Welcome tab load', async ({ page }) => {
    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)
    await expect(nb.getByRole('heading', { name: 'Notebook app', level: 1 })).toBeVisible()
    await expect(nb.getByRole('complementary', { name: 'Saved notebooks' })).toBeVisible()
    await expect(nb.getByRole('tablist', { name: 'Open notebooks' })).toBeVisible()
    await expect(nb.locator('.nb-tab-title').filter({ hasText: /^Welcome$/ })).toBeVisible()
  })

  test('examples picker and Open example', async ({ page }) => {
    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)
    const select = nb.locator('#nb-welcome-examples-select')
    await select.waitFor({ state: 'visible', timeout: 120_000 })
    await expect(
      nb.locator('#nb-welcome-examples-select option').filter({ hasText: 'Cribl Search Lookup Magics' }),
    ).not.toHaveCount(0)
    const openBtn = nb.getByRole('button', { name: 'Open example' })
    await expect(openBtn).toBeEnabled({ timeout: 120_000 })
    const tabsBefore = await nb.locator('[role="tab"]').count()
    await openBtn.click()
    await expect(nb.locator('[role="tab"]')).toHaveCount(tabsBefore + 1, { timeout: 60_000 })
  })
})

test.describe('@regression workspace', () => {
  test('New notebook creates tab, toolbar, and editor', async ({ page }) => {
    await navigateToStagingNotebookApp(page)
    const nb = await getNotebookFrame(page)
    await nb.locator('button.nb-tab-new').click()
    await expect(nb.locator('.nb-tab-title').filter({ hasText: 'Untitled' })).toBeVisible({
      timeout: 60_000,
    })
    await expect(nb.getByTitle('Add code cell at end')).toBeVisible()
    await expect(nb.getByRole('button', { name: /Run All/ })).toBeVisible()
    await expect(nb.locator('.cm-editor').first()).toBeVisible({ timeout: 90_000 })
  })
})
