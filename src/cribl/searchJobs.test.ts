import { describe, it, expect } from 'vitest'
import {
  normalizeSearchQuery,
  extractFirstJsonValue,
  parseJobPhase,
  parseLenientJsonResponseBody,
  parseSearchJobCreateId,
  parseTotalRecordHint,
  runCriblSearchJob,
} from './searchJobs'

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
})

describe('parseTotalRecordHint', () => {
  it('reads common total keys', () => {
    expect(parseTotalRecordHint({ total: 42 })).toBe(42)
    expect(parseTotalRecordHint({ resultCount: 7 })).toBe(7)
    expect(parseTotalRecordHint({ entry: [{ content: { eventCount: 99 } }] })).toBe(99)
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
})
