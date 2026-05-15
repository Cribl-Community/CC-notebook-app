import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeSearchQuery,
  extractFirstJsonValue,
  parseJobPhase,
  parseLenientJsonResponseBody,
  parseNdjsonSearchResultsBody,
  parseSearchJobCreateId,
  parseTotalRecordHint,
  runCriblSearchJob,
} from '@platform/cribl/searchJobs'

describe('parseSearchJobCreateId', () => {
  it('reads top-level id', () => {
    expect(parseSearchJobCreateId({ id: 'job-abc' })).toBe('job-abc')
  })

  it('reads items[0].id (Cribl list wrapper)', () => {
    expect(parseSearchJobCreateId({ items: [{ id: '1349305736255.Acp7er', query: 'cribl ...' }] })).toBe(
      '1349305736255.Acp7er',
    )
  })

  it('reads entry[0].content.sid', () => {
    expect(
      parseSearchJobCreateId({
        entry: [{ content: { sid: 'sid-123', isDone: false } }],
      }),
    ).toBe('sid-123')
  })

  it('coerces numeric id', () => {
    expect(parseSearchJobCreateId({ id: 42 })).toBe('42')
  })
})

describe('parseJobPhase', () => {
  it('detects Cribl entry[0].content.isDone', () => {
    expect(
      parseJobPhase({
        entry: [{ content: { sid: 'sid-1', isDone: true } }],
      }),
    ).toBe('completed')
    expect(
      parseJobPhase({
        entry: [{ content: { sid: 'sid-1', isDone: false } }],
      }),
    ).toBe('running')
  })

  it('detects top-level status completed', () => {
    expect(parseJobPhase({ status: 'completed' })).toBe('completed')
    expect(parseJobPhase({ state: 'DONE' })).toBe('completed')
  })

  it('detects Splunk-style dispatchState', () => {
    expect(parseJobPhase({ dispatchState: 'COMPLETED' })).toBe('completed')
    expect(parseJobPhase({ dispatchState: 'FAILED' })).toBe('failed')
  })

  it('detects items[0].content.isDone', () => {
    expect(parseJobPhase({ items: [{ id: 'j1', content: { isDone: true } }] })).toBe('completed')
  })
})

describe('parseLenientJsonResponseBody', () => {
  it('parses a normal JSON object', () => {
    expect(parseLenientJsonResponseBody('{"id":"j1"}')).toEqual({ id: 'j1' })
  })

  it('parses the first value when multiple JSON objects are concatenated', () => {
    const body = '{"id":"first","x":1}\n{"id":"second"}'
    expect(parseLenientJsonResponseBody(body)).toEqual({ id: 'first', x: 1 })
  })

  it('extractFirstJsonValue ignores braces inside strings', () => {
    const chunk = '{"raw":"a}b","n":1}'
    expect(extractFirstJsonValue(`  ${chunk}  \ntrailing`)).toBe(chunk)
  })
})

describe('normalizeSearchQuery', () => {
  it('prepends cribl when missing', () => {
    expect(normalizeSearchQuery('dataset=x | limit 1')).toBe('cribl dataset=x | limit 1')
  })

  it('does not double-prefix', () => {
    expect(normalizeSearchQuery('cribl dataset=x')).toBe('cribl dataset=x')
    expect(normalizeSearchQuery('CRIBL dataset=x')).toBe('CRIBL dataset=x')
  })

  it('does not prefix externaldata pipelines', () => {
    const q = 'externaldata\n[\n  "https://example.com/t.csv"\n]\nwith(\n  datatype="CSV Datatypes"\n)'
    expect(normalizeSearchQuery(q)).toBe(q)
  })
})

describe('parseTotalRecordHint', () => {
  it('reads common total keys', () => {
    expect(parseTotalRecordHint({ total: 42 })).toBe(42)
    expect(parseTotalRecordHint({ resultCount: 7 })).toBe(7)
    expect(parseTotalRecordHint({ entry: [{ content: { eventCount: 99 } }] })).toBe(99)
    expect(parseTotalRecordHint({ totalEventCount: 1000 })).toBe(1000)
  })
})

describe('parseNdjsonSearchResultsBody', () => {
  it('skips metadata line and collects event objects', () => {
    const body = [
      '{"isFinished":true,"totalEventCount":3,"limit":5000,"offset":0,"job":{"id":"j1"}}',
      '{"dataset":"d","_raw":"one","_time":1}',
      '{"dataset":"d","_raw":"two","_time":2}',
    ].join('\n')
    const { rows, totalHint } = parseNdjsonSearchResultsBody(body)
    expect(totalHint).toBe(3)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ _raw: 'one' })
  })
})

describe('runCriblSearchJob mock', () => {
  it('returns rows without CRIBL_API_URL', async () => {
    const lines: string[] = []
    const { rows, columns, totalRecords } = await runCriblSearchJob({
      query: 'dataset=x',
      onProgress: (ev) => lines.push(ev.label),
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(lines.some((l) => l.includes('local stub'))).toBe(true)
    expect(rows[0]).toHaveProperty('query')
    expect(columns.length).toBeGreaterThan(0)
    expect(totalRecords).toBe(rows.length)
  })

  it('keeps verbatim query text in local stub when requested', async () => {
    const query = 'externaldata\n[\n"https://example.com/data.json"\n]'
    const { rows } = await runCriblSearchJob({
      query,
      queryMode: 'verbatim',
    })
    expect(rows[0]?.query).toBe(query)
  })
})

describe('runCriblSearchJob queryMode', () => {
  type MaybeWindow = { CRIBL_API_URL?: string }
  const originalFetch = globalThis.fetch
  const originalWindow = (globalThis as { window?: MaybeWindow }).window

  beforeEach(() => {
    ;(globalThis as { window?: MaybeWindow }).window = {
      ...(originalWindow ?? {}),
      CRIBL_API_URL: 'https://cribl.example/api/v1',
    }
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    ;(globalThis as { window?: MaybeWindow }).window = originalWindow
  })

  it('sends verbatim query payload when queryMode=verbatim', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'job-1', status: 'completed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [{ _raw: 'ok' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const query = 'externaldata\n[\n"https://example.com/data.json"\n]'
    await runCriblSearchJob({ query, queryMode: 'verbatim' })

    const call = fetchMock.mock.calls[0]
    const init = call?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as { query: string }
    expect(body.query).toBe(query)
  })

  it('keeps normalized behavior by default', async () => {
    const fetchMock = vi.fn()
    globalThis.fetch = fetchMock as unknown as typeof fetch
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'job-2', status: 'completed' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    await runCriblSearchJob({ query: 'dataset=x | limit 1' })
    const call = fetchMock.mock.calls[0]
    const init = call?.[1] as RequestInit
    const body = JSON.parse(String(init.body)) as { query: string }
    expect(body.query).toBe('cribl dataset=x | limit 1')
  })

  it('surfaces create fetch failures immediately without retrying polls', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    await expect(runCriblSearchJob({ query: 'dataset=x | limit 1' })).rejects.toThrow(
      /not retried/i,
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
