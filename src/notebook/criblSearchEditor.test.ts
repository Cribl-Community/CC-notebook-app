import { describe, expect, it } from 'vitest'
import { analyzeCriblSearchCell, tokenizeKqlRegion } from './criblSearchEditor'

describe('analyzeCriblSearchCell', () => {
  it('detects magic and KQL offset', () => {
    const code = '%%cribl_search var=df\ndataset=x | limit 1\n'
    const r = analyzeCriblSearchCell(code)
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(code.slice(r.kqlFrom, r.kqlTo)).toBe('dataset=x | limit 1\n')
  })

  it('returns none for normal Python', () => {
    expect(analyzeCriblSearchCell('print(1)').kind).toBe('none')
  })

  it('matches leading whitespace on first line like parseCriblSearchMagic', () => {
    const code = '  %%cribl_search\nq\n'
    expect(analyzeCriblSearchCell(code).kind).toBe('cribl_search')
  })
})

describe('tokenizeKqlRegion', () => {
  it('tags keywords and pipes', () => {
    const kql = 'cribl dataset | where x == 1 | limit 10'
    const code = `%%cribl_search\n${kql}`
    const info = analyzeCriblSearchCell(code)
    expect(info.kind).toBe('cribl_search')
    if (info.kind !== 'cribl_search') return
    const tok = tokenizeKqlRegion(code, info.kqlFrom, info.kqlTo)
    const kinds = tok.map((t) => code.slice(t.from, t.to))
    expect(kinds).toContain('cribl')
    expect(kinds).toContain('|')
    expect(kinds).toContain('where')
    expect(kinds).toContain('limit')
  })
})
