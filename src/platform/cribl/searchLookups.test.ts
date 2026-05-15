import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as criblApiFetch from '@platform/cribl/criblApiFetch'
import { criblLookupService, normalizeSearchLookupCsvId } from './searchLookups'

vi.mock('@platform/cribl/criblApiFetch', () => ({
  callCriblApi: vi.fn(),
}))

describe('normalizeSearchLookupCsvId', () => {
  it('appends .csv when missing', () => {
    expect(normalizeSearchLookupCsvId('foo')).toBe('foo.csv')
  })
  it('preserves existing suffix', () => {
    expect(normalizeSearchLookupCsvId('Foo.CSV')).toBe('Foo.CSV')
  })
})

describe('criblLookupService', () => {
  beforeEach(() => {
    vi.mocked(criblApiFetch.callCriblApi).mockReset()
  })

  it('POSTs new lookup when id is not in list', async () => {
    const fn = vi.mocked(criblApiFetch.callCriblApi)
    fn.mockImplementation(async (method: string) => {
      if (method === 'GET') {
        return { ok: true, status: 200, text: JSON.stringify({ items: [{ id: 'other.csv' }], count: 1 }), jsonValue: {} }
      }
      if (method === 'PUT') {
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({ filename: 'nb_upload.tmp.csv', rows: 1, size: 10 }),
          jsonValue: {},
        }
      }
      if (method === 'POST') {
        return { ok: true, status: 200, text: JSON.stringify({ items: [{ id: 'new.csv' }], count: 1 }), jsonValue: {} }
      }
      throw new Error(`unexpected ${method}`)
    })
    await criblLookupService.saveLookupFromCsv({
      group: 'default_search',
      lookupId: 'new',
      csvUtf8: 'a,b\n1,2\n',
      replace: false,
      mode: 'memory',
    })
    expect(fn.mock.calls.some((c) => c[0] === 'POST' && c[1] === '/m/default_search/system/lookups')).toBe(true)
  })

  it('PATCHes when lookup exists and replace=true', async () => {
    const fn = vi.mocked(criblApiFetch.callCriblApi)
    fn.mockImplementation(async (method: string, path: string) => {
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({ items: [{ id: 'x.csv' }], count: 1 }),
          jsonValue: {},
        }
      }
      if (method === 'PUT') {
        return { ok: true, status: 200, text: JSON.stringify({ filename: 'tmp.ABC' }), jsonValue: {} }
      }
      if (method === 'PATCH' && path.includes('x.csv')) {
        return { ok: true, status: 200, text: '{}', jsonValue: {} }
      }
      throw new Error(`unexpected ${method} ${path}`)
    })
    await criblLookupService.saveLookupFromCsv({
      group: 'default_search',
      lookupId: 'x',
      csvUtf8: 'a\n1\n',
      replace: true,
      mode: 'memory',
    })
    expect(fn.mock.calls.some((c) => c[0] === 'PATCH' && c[1] === '/m/default_search/system/lookups/x.csv')).toBe(
      true,
    )
  })

  it('rejects existing lookup when replace=false', async () => {
    const fn = vi.mocked(criblApiFetch.callCriblApi)
    fn.mockImplementation(async (method: string) => {
      if (method === 'GET') {
        return {
          ok: true,
          status: 200,
          text: JSON.stringify({ items: [{ id: 'x.csv' }], count: 1 }),
          jsonValue: {},
        }
      }
      if (method === 'PUT') {
        return { ok: true, status: 200, text: JSON.stringify({ filename: 'tmp' }), jsonValue: {} }
      }
      throw new Error(`unexpected ${method}`)
    })
    await expect(
      criblLookupService.saveLookupFromCsv({
        group: 'default_search',
        lookupId: 'x',
        csvUtf8: 'a\n1\n',
        replace: false,
        mode: 'memory',
      }),
    ).rejects.toThrow(/already exists/)
  })

  it('downloadLookupCsv GETs content', async () => {
    const fn = vi.mocked(criblApiFetch.callCriblApi)
    fn.mockResolvedValue({ ok: true, status: 200, text: 'c,d\n3,4\n', jsonValue: null })
    const csv = await criblLookupService.downloadLookupCsv({ group: 'default_search', lookupId: 'z.csv' })
    expect(csv).toBe('c,d\n3,4\n')
    expect(fn).toHaveBeenCalledWith(
      'GET',
      '/m/default_search/system/lookups/z.csv/content?raw=1',
      expect.any(Object),
    )
  })
})
