import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import { defineConfig, devices } from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '.env') })

/** Interactive login + storageState capture — run alone via `npm run e2e:auth`. */
export default defineConfig({
  testDir: path.join(__dirname, 'specs'),
  timeout: 300_000,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list']],
  use: {
    baseURL: process.env.CRIBL_E2E_BASE_URL,
    ignoreHTTPSErrors: true,
    ...devices['Desktop Chrome'],
    headless: false,
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts$/,
    },
  ],
})
