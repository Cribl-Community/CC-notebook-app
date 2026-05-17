import { describe, it, expect } from 'vitest'
import { applySearchRowCap, normalizeSearchQuery } from '@platform/cribl/searchQuery'

describe('applySearchRowCap', () => {
  const external = `externaldata
[
  "https://example.com/t.csv"
]
with(
  datatype="CSV Datatypes"
)`

  it('appends | limit for externaldata when maxRows > 0', () => {
    expect(applySearchRowCap(external, 200)).toBe(`${external}\n| limit 200`)
  })

  it('is a no-op when maxRows is 0', () => {
    expect(applySearchRowCap(external, 0)).toBe(external)
  })

  it('appends | limit for dataset pipelines when maxRows > 0', () => {
    const q = normalizeSearchQuery('dataset=x | sort by _time desc')
    expect(applySearchRowCap(q, 100)).toBe(`${q}\n| limit 100`)
  })

  it('does not double-append when query already has | limit', () => {
    const withLimit = `${external}\n| limit 50`
    expect(applySearchRowCap(withLimit, 200)).toBe(withLimit)
  })
})
