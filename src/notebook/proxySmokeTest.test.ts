import { afterEach, describe, expect, it, vi } from 'vitest'
import { PYODIDE_RELEASE } from '../pyodide/pyodideVersion'
import {
  getProxySmokeCheckDefinitions,
  resolvePythonHostedWheelProbeUrl,
  runProxySmokeTests,
  type ProxySmokeRowResult,
} from './proxySmokeTest'

describe('getProxySmokeCheckDefinitions', () => {
  it('uses URLs that match config/proxies.yml allowlists', () => {
    const checks = getProxySmokeCheckDefinitions()
    expect(checks).toHaveLength(4)

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
    expect(files?.proxyYamlHost).toBe('files.pythonhosted.org')

    const ai = checks.find((c) => c.id === 'ai')
    expect(ai?.url).toMatch(/^https:\/\/ai\.cribl(-staging)?\.cloud\//)
    expect(ai?.acceptHttpErrors).toBe(true)
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

  it('resolves files probe URL then fetches the wheel', async () => {
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

    const defs = getProxySmokeCheckDefinitions().filter((d) => d.id === 'files')
    const finals: ProxySmokeRowResult[] = []
    await runProxySmokeTests(defs, (row) => {
      if (row.status !== 'pending') finals.push(row)
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://pypi.org/pypi/pip/json')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('https://files.pythonhosted.org/packages/z/w.whl')
    expect(finals[0]?.status).toBe('ok')
  })

  it('treats HTTP errors as reachable when acceptHttpErrors=true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('denied', { status: 403 })))
    const defs = [
      {
        id: 'ai',
        proxyYamlHost: 'ai.cribl.cloud',
        label: 'ai',
        url: 'https://ai.cribl.cloud/v1/translate/kql',
        acceptHttpErrors: true,
      },
    ]
    const finals: ProxySmokeRowResult[] = []
    await runProxySmokeTests(defs, (row) => {
      if (row.status !== 'pending') finals.push(row)
    })
    expect(finals).toHaveLength(1)
    expect(finals[0]?.status).toBe('ok')
    expect(finals[0]?.httpStatus).toBe(403)
  })
})
