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

/** Parallel worker count; CLI `--workers` overrides. Supports integers or Playwright `%` strings (e.g. `50%`). */
function resolveWorkers(): number | string {
  const raw = process.env.CRIBL_E2E_WORKERS?.trim()
  if (!raw) return 2
  if (/^\d+%$/.test(raw)) return raw
  const n = Number.parseInt(raw, 10)
  if (Number.isFinite(n) && n >= 1) return n
  return 2
}

export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: resolveWorkers(),
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
