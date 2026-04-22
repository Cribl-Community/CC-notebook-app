import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetPackageFetchCacheForTest,
  cacheKeyForPackageUrl,
  fetchWithPackageSessionCache,
  isAppHostedPyodideUrl,
  shouldCachePackageFetchUrl,
  shouldCacheRemotePackageUrl,
} from '@platform/pyodide/packageFetchCache'

describe('cacheKeyForPackageUrl', () => {
  it('drops hash', () => {
    expect(cacheKeyForPackageUrl('https://cdn.jsdelivr.net/pyodide/v0.29.3/full/foo.json#a')).toBe(
      'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/foo.json',
    )
  })
})

describe('shouldCacheRemotePackageUrl', () => {
  it('allows known registry hosts', () => {
    expect(shouldCacheRemotePackageUrl('https://cdn.jsdelivr.net/pyodide/v0.29.3/full/bar.whl')).toBe(true)
    expect(shouldCacheRemotePackageUrl('https://pypi.org/pypi/pip/json')).toBe(true)
    expect(shouldCacheRemotePackageUrl('https://files.pythonhosted.org/packages/x/y/z/wheel.whl')).toBe(true)
    expect(shouldCacheRemotePackageUrl('https://www.pypi.org/pypi/foo/json')).toBe(true)
  })
  it('rejects other hosts', () => {
    expect(shouldCacheRemotePackageUrl('https://evil.example/wheel.whl')).toBe(false)
    expect(shouldCacheRemotePackageUrl('not a url')).toBe(false)
  })
})

const appBase = 'https://app.example.com/my-pack/pyodide/'

describe('isAppHostedPyodideUrl', () => {
  it('matches the base tree', () => {
    expect(isAppHostedPyodideUrl('https://app.example.com/my-pack/pyodide/pyodide.js', appBase)).toBe(true)
    expect(isAppHostedPyodideUrl('https://app.example.com/my-pack/pyodide/sub/pkg.data', appBase)).toBe(true)
  })
  it('rejects other origins and paths', () => {
    expect(isAppHostedPyodideUrl('https://other.example.com/my-pack/pyodide/x', appBase)).toBe(false)
    expect(isAppHostedPyodideUrl('https://app.example.com/other/pyodide.js', appBase)).toBe(false)
  })
  it('rejects lookalike path prefixes', () => {
    expect(isAppHostedPyodideUrl('https://app.example.com/my-pack/pyodide-evil/s', appBase)).toBe(false)
  })
})

describe('shouldCachePackageFetchUrl', () => {
  it('includes remote hosts without app base', () => {
    expect(shouldCachePackageFetchUrl('https://pypi.org/pypi/pip/json', undefined)).toBe(true)
  })
  it('includes app pyodide paths when base is set', () => {
    expect(shouldCachePackageFetchUrl('https://app.example.com/my-pack/pyodide/x.wasm', appBase)).toBe(true)
  })
  it('omits arbitrary same-origin paths without base', () => {
    expect(shouldCachePackageFetchUrl('https://app.example.com/static/app.js', undefined)).toBe(false)
  })
})

/**
 * These tests validate the **performance** property of the post-refactor path: app-hosted
 * `pyodide/*` assets go through `fetchWithPackageSessionCache` (main thread) so the same
 * in-flight + memory dedupe that already applied to remote wheels now applies to same-
 * origin lazy loads. The old setup used the worker’s native `fetch` per request with no
 * process-wide dedupe; parallel kernels could issue N concurrent GETs to the same URL
 * (browser cache may or may not collapse them to one network read).
 */
describe('fetchWithPackageSessionCache (same-origin pyodide — network efficiency)', () => {
  const fetchMock = vi.fn<typeof fetch>()

  beforeEach(() => {
    __resetPackageFetchCacheForTest()
    // Avoid cross-test call counts and Node's Cache / undici using fetch for cache.put
    if (globalThis.caches) {
      vi.stubGlobal('caches', undefined)
    }
    fetchMock.mockReset()
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(new ArrayBuffer(4), { status: 200, statusText: 'OK' })),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('dedupes in-flight: parallel GETs to the same app pyodide URL call window.fetch once', async () => {
    const id = crypto.randomUUID()
    const appBase = `https://app-perf.test/t/${id}/pyodide/`
    const url = new URL('test-asset.wasm', appBase).href
    const init: RequestInit = { cache: 'no-store' }

    await Promise.all([
      fetchWithPackageSessionCache(url, init, appBase),
      fetchWithPackageSessionCache(url, init, appBase),
    ])

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('serves a second call from memory without a second network fetch', async () => {
    const id = crypto.randomUUID()
    const appBase = `https://app-perf.test/t/${id}/pyodide/`
    const url = new URL('second-asset.data', appBase).href
    const init: RequestInit = { cache: 'no-store' }

    await fetchWithPackageSessionCache(url, init, appBase)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockClear()
    await fetchWithPackageSessionCache(url, init, appBase)
    expect(fetchMock).toHaveBeenCalledTimes(0)
  })

  it('without app base, same origin URL is not session-cached (regression: two fetches for two calls)', async () => {
    const id = crypto.randomUUID()
    const notPassedBase = `https://n-base.test/t/${id}/pyodide/`
    const url = new URL('uncached.js', notPassedBase).href
    const init: RequestInit = { cache: 'no-store' }

    await Promise.all([fetchWithPackageSessionCache(url, init), fetchWithPackageSessionCache(url, init)])
    // Bypasses the cache path — separate window.fetch per call (old behaviour for “no base”).
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
