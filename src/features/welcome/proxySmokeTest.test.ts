import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PYODIDE_RELEASE } from '@app/providers'
import {
  getProxySmokeCheckDefinitions,
  parseProxiesYamlEntries,
  resolvePythonHostedWheelProbeUrl,
  runProxySmokeTests,
  type ProxySmokeRowResult,
} from '@features/welcome/proxySmokeTest'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

describe('parseProxiesYamlEntries', () => {
  it('returns top-level keys in order with allowlists', () => {
    const raw = `
a.example.com:
  paths:
    allowlist:
      - /one/
b.example.com: {}
`
    const entries = parseProxiesYamlEntries(raw)
    expect(entries.map((e) => e.yamlKey)).toEqual(['a.example.com', 'b.example.com'])
    expect(entries[0]?.allowlist).toEqual(['/one/'])
    expect(entries[1]?.allowlist).toEqual([])
  })
})

describe('getProxySmokeCheckDefinitions', () => {
  it('covers every top-level host in config/proxies.yml with allowlist-aligned probes', () => {
    const yml = readFileSync(join(repoRoot, 'config', 'proxies.yml'), 'utf8')
    const parsed = parseProxiesYamlEntries(yml)
    expect(parsed.length).toBeGreaterThan(0)

    const checks = getProxySmokeCheckDefinitions()
    const hosts = checks.map((c) => c.proxyYamlHost)
    for (const { yamlKey } of parsed) {
      expect(hosts).toContain(yamlKey)
    }

    const jsd = checks.find((c) => c.id === 'jsdelivr')
    expect(jsd?.url).toBe(
      `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/pyodide-lock.json`,
    )
    expect(jsd?.proxyYamlHost).toBe('cdn.jsdelivr.net')

    const pypi = checks.find((c) => c.id === 'pypi')
    expect(pypi?.url).toMatch(/^https:\/\/pypi\.org\/pypi\//)
    expect(pypi?.proxyYamlHost).toBe('pypi.org')

    const files = checks.find((c) => c.id === 'files')
    expect(files?.url).toBeUndefined()
    expect(files?.probeMode).toBe('pypi-wheel')
    expect(files?.proxyYamlHost).toBe('files.pythonhosted.org')

    const composio = checks.find((c) => c.proxyYamlHost === 'backend.composio.dev')
    expect(composio).toBeDefined()
    expect(composio?.acceptHttpErrors).toBe(true)
    expect(composio?.url).toMatch(/^https:\/\/backend\.composio\.dev\/api\/v3\.1\//)
  })
})

describe('resolvePythonHostedWheelProbeUrl', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns a files.pythonhosted.org URL from pip PyPI JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            urls: [
              { packagetype: 'sdist', url: 'https://files.pythonhosted.org/a.tar.gz' },
              {
                packagetype: 'bdist_wheel',
                url: 'https://files.pythonhosted.org/packages/x/pip-1.whl',
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    )
    const url = await resolvePythonHostedWheelProbeUrl()
    expect(url).toBe('https://files.pythonhosted.org/packages/x/pip-1.whl')
  })

  it('throws when no wheel URL', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ urls: [] }), { status: 200 })),
    )
    await expect(resolvePythonHostedWheelProbeUrl()).rejects.toThrow()
  })
})

describe('runProxySmokeTests', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('reports ok when fetch succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 200 })))
    const defs = [
      {
        id: 'x',
        proxyYamlHost: 'example.com',
        label: 'test',
        url: 'https://example.com/a',
      },
    ]
    const finals: ProxySmokeRowResult[] = []
    await runProxySmokeTests(defs, (row) => {
      if (row.def.id === 'x' && row.status !== 'pending') finals.push(row)
    })
    expect(finals).toHaveLength(1)
    expect(finals[0]?.status).toBe('ok')
    expect(finals[0]?.httpStatus).toBe(200)
  })

  it('resolves pypi-wheel probe URL then fetches the wheel', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            urls: [
              {
                packagetype: 'bdist_wheel',
                url: 'https://files.pythonhosted.org/packages/z/w.whl',
              },
            ],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const defs = getProxySmokeCheckDefinitions().filter((d) => d.probeMode === 'pypi-wheel')
    const finals: ProxySmokeRowResult[] = []
    await runProxySmokeTests(defs, (row) => {
      if (row.status !== 'pending') finals.push(row)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://pypi.org/pypi/pip/json')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://files.pythonhosted.org/packages/z/w.whl')
    expect(finals[0]?.status).toBe('ok')
  })
})
