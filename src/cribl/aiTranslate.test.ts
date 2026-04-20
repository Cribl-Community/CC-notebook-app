import { afterEach, describe, expect, it, vi } from 'vitest'
import { AI_INTERNAL_TRANSLATE_PATH, translateEnglishToKql } from './aiTranslate'

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
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/v1${AI_INTERNAL_TRANSLATE_PATH}`)
  })

  it('extracts kql from ndjson stream response', async () => {
    const ndjson = [
      JSON.stringify({ name: 'agent:kql-agent', role: 'assistant', content: null }),
      JSON.stringify({ delta: { content: '```kql\\ndataset=cribl_search_sample | where action == "REJECT" | limit 100\\n```' } }),
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(ndjson, {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson; charset=utf-8' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('failed events')).resolves.toBe(
      'dataset=cribl_search_sample | where action == "REJECT" | limit 100',
    )
  })

  it('throws on non-2xx responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('bad gateway', { status: 502 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('test')).rejects.toThrow(/AI translation failed \(502\)/)
  })

  it('throws when response has no kql candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('test')).rejects.toThrow(/did not include KQL text/i)
  })

  it('replaces [CollectionName] placeholder with dataset hint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: '```kql\n[CollectionName] | sort by _time desc | limit 2000\n```',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      translateEnglishToKql('show 2000 most recent records', { datasetHint: 'cribl_search_sample' }),
    ).resolves.toBe('dataset=cribl_search_sample | sort by _time desc | limit 2000')
  })

  it('ignores query_modification scaffolding and collection description blocks', async () => {
    const noisy = [
      'dataset=cribl_search_sample',
      'query_modification',
      '',
      '[CollectionDescription] test',
      'dataset=cribl_search_sample | sort by _time desc | limit 2000',
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: noisy,
          translatedQuery: 'dataset=cribl_search_sample | sort by _time desc | limit 2000',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('show the 2000 most recent records')).resolves.toBe(
      'dataset=cribl_search_sample | sort by _time desc | limit 2000',
    )
  })

  it('extracts kql from json-string content payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          content: '{"kqlQuery":"cribl dataset=cribl_search_sample | sort by _time desc | limit 2000"}',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('show the 2000 most recent records')).resolves.toBe(
      'cribl dataset=cribl_search_sample | sort by _time desc | limit 2000',
    )
  })
})
