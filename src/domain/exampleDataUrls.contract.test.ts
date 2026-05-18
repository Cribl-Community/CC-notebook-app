import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ALL_EXAMPLE_DATA_URLS,
  EXAMPLE_DATA_BASE,
  EXAMPLE_DATA_PATHS,
  EXAMPLE_DATA_RAW_URL_PATTERN,
  EXAMPLE_DATA_URLS,
} from './exampleDataUrls'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const examplesDir = join(repoRoot, 'public', 'Examples')

describe('exampleDataUrls contract (bundled notebooks)', () => {
  const allowed = new Set(ALL_EXAMPLE_DATA_URLS)

  it('every raw example-data URL in public/Examples is registered', () => {
    const unknown: string[] = []
    for (const filename of readdirSync(examplesDir).filter((f) => f.endsWith('.ipynb'))) {
      const text = readFileSync(join(examplesDir, filename), 'utf8')
      const matches = text.match(EXAMPLE_DATA_RAW_URL_PATTERN) ?? []
      for (const url of matches) {
        if (!allowed.has(url)) unknown.push(`${filename}: ${url}`)
      }
    }
    expect(unknown, unknown.join('\n')).toEqual([])
  })

  it('Malware_Hash_Threat_Hunt uses registered path segments for hosted CSVs', () => {
    const text = readFileSync(join(examplesDir, 'Malware_Hash_Threat_Hunt.ipynb'), 'utf8')
    expect(text).toContain(EXAMPLE_DATA_BASE)
    expect(text).toContain(EXAMPLE_DATA_PATHS.malwareBazaarTiLookup)
    expect(text).toContain(EXAMPLE_DATA_PATHS.malwareHuntPeImports)
    expect(text).toContain(EXAMPLE_DATA_URLS.malwareBazaarTiLookup)
    expect(text).toContain(EXAMPLE_DATA_URLS.malwareHuntPeImports)
  })

  it('Anomaly_Detection_PyOD externaldata uses the registered temperature URL', () => {
    const text = readFileSync(join(examplesDir, 'Anomaly_Detection_PyOD.ipynb'), 'utf8')
    expect(text).toContain(EXAMPLE_DATA_URLS.dailyMinTemperatures)
  })
})
