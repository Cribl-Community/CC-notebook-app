import path from 'node:path'
import { mkdir } from 'node:fs/promises'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { test as setup } from '@playwright/test'
import { stagingStartUrl } from '../helpers/appShell'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const e2eRoot = path.join(__dirname, '..')

async function waitForEnter(message: string): Promise<void> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  await new Promise<void>((resolve) => {
    rl.question(message, () => {
      rl.close()
      resolve()
    })
  })
}

setup('save staging session', async ({ page }) => {
  const authDir = path.join(e2eRoot, '.auth')
  await mkdir(authDir, { recursive: true })
  const out =
    process.env.CRIBL_E2E_STORAGE_STATE?.trim() ||
    path.join(authDir, 'storageState.json')

  await page.goto(stagingStartUrl())

  const selector = process.env.CRIBL_E2E_POST_LOGIN_SELECTOR?.trim()
  if (selector) {
    await page.locator(selector).waitFor({ state: 'visible', timeout: 300_000 })
  } else {
    await waitForEnter(
      '\nLog in in the browser window, then press Enter here to save session cookies…\n',
    )
  }

  await page.context().storageState({ path: out })
})
