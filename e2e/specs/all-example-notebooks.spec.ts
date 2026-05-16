import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from '@playwright/test'
import {
  expectNoCriticalNotebookErrors,
  getNotebookFrame,
  navigateToStagingNotebookApp,
  openBundledExample,
  waitForKernelReady,
} from '../helpers/appShell'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Matches `exampleNotebookDisplayLabel` in app code (tab title when opening an example). */
function exampleNotebookDisplayLabel(filename: string): string {
  return filename.replace(/\.ipynb$/i, '').replace(/_/g, ' ')
}

type ManifestNotebook = {
  filename: string
  title?: string
  recommendedOrder?: number
}

function loadExamplesManifest(): ManifestNotebook[] {
  const manifestPath = path.join(__dirname, '../../public/Examples/manifest.json')
  const raw = readFileSync(manifestPath, 'utf8')
  const data: unknown = JSON.parse(raw)
  if (!data || typeof data !== 'object') throw new Error(`Invalid manifest JSON at ${manifestPath}`)
  const o = data as Record<string, unknown>
  if (o.version !== 2 || !Array.isArray(o.notebooks)) {
    throw new Error(`Expected manifest version 2 with notebooks[] at ${manifestPath}`)
  }
  return o.notebooks as ManifestNotebook[]
}

const HEAVY_EXAMPLE = 'Anomaly_Detection_PyOD.ipynb'

function runAllTimeouts(filename: string): {
  kernelReadyMs: number
  afterRunAllReadyMs: number
  testTimeout: number
} {
  if (filename === HEAVY_EXAMPLE) {
    return {
      kernelReadyMs: 480_000,
      afterRunAllReadyMs: 2_100_000,
      testTimeout: 2_400_000,
    }
  }
  return {
    kernelReadyMs: 480_000,
    afterRunAllReadyMs: 600_000,
    testTimeout: 900_000,
  }
}

/**
 * Opt-in manifest-driven Run All for every bundled example (`npm run e2e:examples`).
 * Tagged `@examples-all` only (not `@slow`) so `npm run e2e` phases stay unchanged;
 * `e2e:quick` excludes `@examples-all` to avoid parallel Pyodide storms.
 */
test.describe('@examples-all matrix', () => {
  test.describe.configure({ mode: 'serial', retries: 2 })

  const notebooks = loadExamplesManifest()
    .filter((n) => typeof n.filename === 'string' && n.filename.trim().length > 0)
    .sort((a, b) => {
      const order = (a.recommendedOrder ?? 999) - (b.recommendedOrder ?? 999)
      return order !== 0 ? order : a.filename.localeCompare(b.filename)
    })

  for (const { filename, title } of notebooks) {
    const tabTitle = exampleNotebookDisplayLabel(filename)
    const humanName =
      typeof title === 'string' && title.trim().length > 0 ? title.trim() : tabTitle
    const heavyPrefix = filename === HEAVY_EXAMPLE ? '@heavy ' : ''

    test(`${heavyPrefix}@examples-all ${humanName}: Run All completes without critical cell errors`, async ({
      page,
    }) => {
      const { kernelReadyMs, afterRunAllReadyMs, testTimeout } = runAllTimeouts(filename)
      test.setTimeout(testTimeout)

      await navigateToStagingNotebookApp(page)
      const nb = await getNotebookFrame(page)

      await openBundledExample(nb, filename)
      await nb.locator('.nb-tab-title').filter({ hasText: tabTitle }).waitFor({
        state: 'visible',
        timeout: 90_000,
      })

      await waitForKernelReady(nb, kernelReadyMs)

      const runAll = nb.getByRole('button', { name: /Run All/ })
      await expect(runAll).toBeEnabled({ timeout: 60_000 })
      await runAll.click()

      await expect(nb.locator('.nb-toolbar .nb-kernel-status').getByText('Ready', { exact: true })).toBeVisible({
        timeout: afterRunAllReadyMs,
      })

      await expectNoCriticalNotebookErrors(nb)
    })
  }
})
