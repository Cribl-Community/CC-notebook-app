import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_TRANSLATE_PATHS, translateEnglishToKql } from './aiTranslate'

describe('translateEnglishToKql', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns translated kql from JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ kql: 'dataset=x | limit 10' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('show me errors')).resolves.toBe('dataset=x | limit 10')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to later endpoint when first returns 404', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ translatedQuery: 'dataset=y | limit 5' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('latest events')).resolves.toBe('dataset=y | limit 5')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(AI_TRANSLATE_PATHS[0])
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain(AI_TRANSLATE_PATHS[1])
  })

  it('throws on non-404 error responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('test')).rejects.toThrow(/AI translation failed \(502\)/)
  })
})
