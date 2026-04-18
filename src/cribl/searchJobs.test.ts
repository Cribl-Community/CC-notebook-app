import { describe, it, expect } from 'vitest'
import {
  normalizeSearchQuery,
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
