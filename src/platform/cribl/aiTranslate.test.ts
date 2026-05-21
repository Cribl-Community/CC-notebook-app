import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AI_INTERNAL_TRANSLATE_PATH,
  buildTranslateEnglishToKqlRequestBody,
  translateEnglishToKql,
} from '@platform/cribl/aiTranslate'

const HOSTED_API = 'https://cribl.example/api/v1'

describe('translateEnglishToKql (AI endpoint)', () => {
  let prevUrl: string | undefined

  beforeEach(() => {
    prevUrl = window.CRIBL_API_URL
    window.CRIBL_API_URL = HOSTED_API
  })

  afterEach(() => {
    if (prevUrl !== undefined) window.CRIBL_API_URL = prevUrl
    else delete window.CRIBL_API_URL
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('sends Search-aligned JSON body (datasetsInfo, quoted currentKqlQuery; no tools)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ kql: 'dataset=x | limit 10' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await translateEnglishToKql('show me errors', { datasetHint: 'cribl_search_sample' })
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as ReturnType<typeof buildTranslateEnglishToKqlRequestBody>
    expect(body.stream).toBe(true)
    expect(body).not.toHaveProperty('tools')
    expect(body.context.datasetsInfo).toEqual([
      { dataset: { id: 'cribl_search_sample', description: 'Search Cribl provided public sample data' } },
    ])
    expect(body.context.currentKqlQuery).toBe('dataset="cribl_search_sample" | limit 1000 ')
    expect(body.context.resources).toEqual({})
    expect(body.context.files).toEqual({})
  })

  it('buildTranslateEnglishToKqlRequestBody prefers explicit datasetsInfo over datasetHint', () => {
    const b = buildTranslateEnglishToKqlRequestBody('hello', {
      datasetHint: 'cribl_search_sample',
      datasetsInfo: [{ dataset: { id: 'custom_ds', description: 'Custom desc' } }],
    })
    expect(b.context.datasetsInfo).toEqual([{ dataset: { id: 'custom_ds', description: 'Custom desc' } }])
    expect(b.context.currentKqlQuery).toBe('dataset="cribl_search_sample" | limit 1000 ')
  })

  it('returns translated kql from JSON payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ kql: 'dataset=x | limit 10' }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('show me errors')).resolves.toBe('dataset=x | limit 10')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(`${HOSTED_API}${AI_INTERNAL_TRANSLATE_PATH}`)
  })

  it('extracts kql from ndjson stream response', async () => {
    const ndjson = [
      JSON.stringify({ name: 'agent:kql-agent', role: 'assistant', content: null }),
      JSON.stringify({
        delta: {
          content: '```kql\\ndataset=cribl_search_sample | where action == "REJECT" | limit 100\\n```',
        },
      }),
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

  it('formats network/cors fetch failures as non-retry errors', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('test')).rejects.toThrow(/not retried/i)
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

  it('extracts kql from NDJSON tail line via heuristic when JSON has no kql fields', async () => {
    const body = [
      JSON.stringify({ name: 'agent:kql-agent', role: 'assistant', content: null, tool_calls: [] }),
      'noise dataset=cribl_search_sample | sort by _time desc | limit 2 trailing',
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(new Response(body, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('anything', { datasetHint: 'cribl_search_sample' })).resolves.toBe(
      'dataset=cribl_search_sample | sort by _time desc | limit 2',
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

  it('extracts kql when content is nested under objects and arrays', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: { content: [{ type: 'text', text: 'dataset=z | limit 9' }] },
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('nested')).resolves.toBe('dataset=z | limit 9')
  })

  it('accepts Kusto-style | top N (common for “most recent” translations)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kql: 'dataset=cribl_search_sample | top 80 by _time desc',
        }),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('80 most recent')).resolves.toBe(
      'dataset=cribl_search_sample | top 80 by _time desc',
    )
  })

  it('parses SSE-style lines with data: prefix', async () => {
    const sse = ['data: {"kql":"dataset=x | top 10 by _time desc"}', '', 'data: [DONE]', ''].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(new Response(sse, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('recent')).resolves.toBe('dataset=x | top 10 by _time desc')
  })
})

describe('translateEnglishToKql (offline stub)', () => {
  let prevUrl: string | undefined

  beforeEach(() => {
    prevUrl = window.CRIBL_API_URL
    delete window.CRIBL_API_URL
  })

  afterEach(() => {
    if (prevUrl !== undefined) window.CRIBL_API_URL = prevUrl
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('maps “80 most recent” to sample KQL without calling fetch', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(
      translateEnglishToKql('Show the 80 most recent entries', { datasetHint: 'cribl_search_sample' }),
    ).resolves.toBe('dataset=cribl_search_sample | sort by _time desc | limit 80')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('returns KQL unchanged when input already looks like KQL', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(translateEnglishToKql('dataset=x | limit 3')).resolves.toBe('dataset=x | limit 3')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses generic “recent” phrasing with limit 100', async () => {
    await expect(translateEnglishToKql('anything recent here')).resolves.toBe(
      'dataset=cribl_search_sample | sort by _time desc | limit 100',
    )
  })
})
