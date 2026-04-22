import { describe, it, expect } from 'vitest'
import { criblSearchPlainSummary, formatCriblSearchError } from '@features/cribl-search/criblSearchCellRunner'

describe('criblSearchCellRunner', () => {
  it('formatCriblSearchError annotates parser failure with KQL hint', () => {
    const raw =
      'Search job create failed (400): line 1:0 no viable alternative at input \'bad\''
    const out = formatCriblSearchError(raw, 'dataset=_raw | bad')
    expect(out).toContain('Generated KQL is invalid for Cribl Search')
    expect(out).toContain('dataset=_raw | bad')
  })

  it('criblSearchPlainSummary formats completed totals', () => {
    const s = criblSearchPlainSummary({
      kind: 'completed',
      columns: ['a'],
      rows: [],
      recordsReturned: 2,
      totalRecords: 10,
      dataframeVar: 'df',
      showTable: false,
    })
    expect(s).toContain('2 records (10 total)')
  })
})
