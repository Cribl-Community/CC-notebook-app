import { describe, it, expect } from 'vitest'
import {
  CRIBL_SEARCH_MAX_DATAFRAME_ROWS,
  pickDataframeChunkRowCount,
  planCriblSearchDataframeHydration,
  rowsForPythonHydration,
} from '@features/cribl-search/criblSearchDataframeHydration'

describe('rowsForPythonHydration', () => {
  it('caps rows for Pyodide', () => {
    const rows = Array.from({ length: 60_000 }, (_, i) => ({ i }))
    const r = rowsForPythonHydration(rows, 60_000)
    expect(r.rowsToLoad).toHaveLength(CRIBL_SEARCH_MAX_DATAFRAME_ROWS)
    expect(r.truncated).toBe(true)
    expect(r.totalCount).toBe(60_000)
  })
})

describe('pickDataframeChunkRowCount', () => {
  it('uses smaller chunks for wide rows', () => {
    const wide: Record<string, unknown> = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [`col_${i}`, i]),
    )
    const n = pickDataframeChunkRowCount([wide, wide, wide])
    expect(n).toBeLessThanOrEqual(300)
  })
})

describe('planCriblSearchDataframeHydration', () => {
  it('returns batched plan for large wide result sets', () => {
    const row = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`col_${i}`, i]))
    const rows = Array.from({ length: 5_000 }, () => ({ ...row }))
    const plan = planCriblSearchDataframeHydration('df', rows, 5_000, false)
    expect(plan.kind).toBe('batched')
    if (plan.kind === 'batched') {
      expect(plan.chunkCodes.length).toBeGreaterThan(1)
      expect(plan.footerCode).toContain('_search_rows_total')
    }
  })
})
