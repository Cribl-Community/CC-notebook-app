import { describe, it, expect } from 'vitest'
import { buildStubRowsForQuery } from '@platform/cribl/searchStub'

describe('buildStubRowsForQuery', () => {
  it('embeds normalized cribl query in rows', () => {
    const rows = buildStubRowsForQuery('dataset=test | limit 5')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].query).toBe('cribl dataset=test | limit 5')
  })
})
