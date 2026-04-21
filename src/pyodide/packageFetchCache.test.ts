import { describe, expect, it } from 'vitest'
import { cacheKeyForPackageUrl, shouldCacheRemotePackageUrl } from './packageFetchCache'

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
