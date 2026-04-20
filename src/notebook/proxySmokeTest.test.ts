import { describe, expect, it } from 'vitest'
import { PYODIDE_RELEASE } from '../pyodide/pyodideVersion'
import { getProxySmokeCheckDefinitions } from './proxySmokeTest'

describe('getProxySmokeCheckDefinitions', () => {
  it('uses URLs that match config/proxies.yml allowlists', () => {
    const checks = getProxySmokeCheckDefinitions()
    expect(checks).toHaveLength(3)

    const jsd = checks.find((c) => c.id === 'jsdelivr')
    expect(jsd?.url).toBe(
      `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/pyodide-lock.json`,
    )
    expect(jsd?.proxyYamlHost).toBe('cdn.jsdelivr.net')

    const pypi = checks.find((c) => c.id === 'pypi')
    expect(pypi?.url).toMatch(/^https:\/\/pypi\.org\/pypi\//)
    expect(pypi?.proxyYamlHost).toBe('pypi.org')

    const files = checks.find((c) => c.id === 'files')
    expect(files?.url).toMatch(/^https:\/\/files\.pythonhosted\.org\/packages\//)
    expect(files?.proxyYamlHost).toBe('files.pythonhosted.org')
  })
})
