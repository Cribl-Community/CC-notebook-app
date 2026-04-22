import { describe, expect, it } from 'vitest'
import {
  cacheKeyForPackageUrl,
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
