import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

const storagePath =
  process.env.CRIBL_E2E_STORAGE_STATE?.trim() ||
  path.join(__dirname, '.auth', 'storageState.json')

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.CRIBL_E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'off',
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      name: 'chromium-staging',
      testMatch: /.*\.spec\.ts$/,
      testIgnore: /auth\.setup\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        ...(existsSync(storagePath) ? { storageState: storagePath } : {}),
      },
    },
  ],
})
