import { describe, it, expect } from 'vitest'
import {
  parseCriblSearchMagic,
  encodeRowsJsonForPythonBase64,
  buildCriblSearchDataframeCode,
} from './criblSearchMagic'

describe('parseCriblSearchMagic', () => {
  it('returns none for normal Python', () => {
    expect(parseCriblSearchMagic('x = 1').kind).toBe('none')
  })

  it('parses defaults', () => {
    const r = parseCriblSearchMagic('%%cribl_search\ndataset=x | limit 1\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.varName).toBe('results_df')
    expect(r.value.preview).toBe(true)
    expect(r.value.query).toBe('dataset=x | limit 1')
  })

  it('parses var and preview', () => {
    const r = parseCriblSearchMagic(
      '%%cribl_search var=df preview=false\ndataset=cribl_search_sample | limit 100',
    )
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.varName).toBe('df')
    expect(r.value.preview).toBe(false)
    expect(r.value.query).toBe('dataset=cribl_search_sample | limit 100')
  })

  it('allows leading whitespace on first line', () => {
    const r = parseCriblSearchMagic('  %%cribl_search\nq\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.query).toBe('q')
  })

  it('errors on empty query', () => {
    const r = parseCriblSearchMagic('%%cribl_search\n')
    expect(r.kind).toBe('error')
  })

  it('errors on bad var name', () => {
    const r = parseCriblSearchMagic('%%cribl_search var=1bad\nx\n')
    expect(r.kind).toBe('error')
  })
})

describe('encodeRowsJsonForPythonBase64 + buildCriblSearchDataframeCode', () => {
  it('round-trips utf-8 through base64 payload', () => {
    const rows = [{ a: 'émoji 🎉' }]
    const b64 = encodeRowsJsonForPythonBase64(rows)
    expect(b64.length).toBeGreaterThan(0)
    const code = buildCriblSearchDataframeCode('results_df', b64, false)
    expect(code).toContain('results_df')
    expect(code).toContain('pd.DataFrame')
  })
})
