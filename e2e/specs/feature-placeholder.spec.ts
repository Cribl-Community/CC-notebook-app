import { test } from '@playwright/test'

/**
 * Use this file (or copy the pattern) for staging checks tied to new features.
 * Tag with @feature-<name> and filter in CI: `npx playwright test --grep @feature-foo`
 */
test.describe('@feature-template', () => {
  test.fixme('replace with assertions for new functionality', async () => {
    // Intentionally empty — remove fixme when implementing.
  })
})
