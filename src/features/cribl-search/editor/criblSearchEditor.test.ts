import { CompletionContext } from '@codemirror/autocomplete'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { analyzeCriblSearchCell, criblSearchCompletionSource, tokenizeKqlRegion } from '@features/cribl-search/editor/criblSearchEditor'

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

  it('finds magic after leading # comments', () => {
    const code = '# note\n%%cribl_search\nq\n'
    const r = analyzeCriblSearchCell(code)
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.magicHeaderLineFrom).toBe(code.indexOf('%%'))
    expect(code.slice(r.kqlFrom, r.kqlTo)).toBe('q\n')
  })
})

describe('criblSearchCompletionSource magic header', () => {
  it('offers limit= with other magic params', () => {
    const code = '%%cribl_search '
    const state = EditorState.create({ doc: code })
    const ctx = new CompletionContext(state, code.length, true)
    const r = criblSearchCompletionSource(ctx)
    expect(r).not.toBeNull()
    const labels = r!.options.map((o) => o.label)
    expect(labels).toContain('limit=')
    expect(labels).toContain('lang=')
    expect(labels).toContain('translate_only=')
    expect(labels).toContain('response=')
    expect(labels).toContain('dataset=')
    expect(labels).toContain('var=')
  })

  it('does not offer params while typing limit value', () => {
    const code = '%%cribl_search limit=500'
    const state = EditorState.create({ doc: code })
    const ctx = new CompletionContext(state, code.length, true)
    expect(criblSearchCompletionSource(ctx)).toBeNull()
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
