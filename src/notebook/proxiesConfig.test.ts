import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PYODIDE_RELEASE } from '../pyodide/pyodideVersion'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

describe('config/proxies.yml', () => {
  it('jsDelivr allowlist path matches PYODIDE_RELEASE', () => {
    const yml = readFileSync(join(repoRoot, 'config', 'proxies.yml'), 'utf8')
    expect(yml).toContain(`/pyodide/v${PYODIDE_RELEASE}/`)
  })

  it('contains Cribl AI translate hosts and paths', () => {
    const yml = readFileSync(join(repoRoot, 'config', 'proxies.yml'), 'utf8')
    expect(yml).toContain('ai.cribl.cloud:')
    expect(yml).toContain('ai.cribl-staging.cloud:')
    expect(yml).toContain('/v1/translate/kql')
    expect(yml).toContain('/v1/translate')
    expect(yml).toContain('/translate')
  })
})
