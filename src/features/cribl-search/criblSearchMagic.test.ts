import { describe, it, expect } from 'vitest'
import {
  parseCriblSearchMagic,
  encodeRowsJsonForPythonBase64,
  buildCriblSearchDataframeCode,
  wantsCriblSearchJinjaTemplating,
  criblSearchQueryLooksLikeJinjaTemplate,
} from '@features/cribl-search/criblSearchMagic'

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
    expect(r.value.response).toBe('dataframe')
    expect(r.value.lang).toBe('kql')
    expect(r.value.limit).toBe(0)
    expect(r.value.query).toBe('dataset=x | limit 1')
    expect(r.value.template).toBe('auto')
  })

  it('parses var and preview', () => {
    const r = parseCriblSearchMagic(
      '%%cribl_search var=df preview=false\ndataset=cribl_search_sample | limit 100',
    )
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.varName).toBe('df')
    expect(r.value.preview).toBe(false)
    expect(r.value.lang).toBe('kql')
    expect(r.value.query).toBe('dataset=cribl_search_sample | limit 100')
  })

  it('parses response=json', () => {
    const r = parseCriblSearchMagic('%%cribl_search response=json\ndataset=x | limit 1\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.response).toBe('json')
  })

  it('errors on invalid response value', () => {
    const r = parseCriblSearchMagic('%%cribl_search response=csv\nq\n')
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/response must be one of dataframe, json, raw/i)
  })

  it('parses lang=english', () => {
    const r = parseCriblSearchMagic('%%cribl_search lang=english\nshow me the latest logs\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.lang).toBe('english')
  })

  it('parses dataset hint from magic header', () => {
    const r = parseCriblSearchMagic(
      '%%cribl_search lang=english dataset=cribl_search_sample\nshow me recent records\n',
    )
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.dataset).toBe('cribl_search_sample')
  })

  it('normalizes lang=kusto to kql', () => {
    const r = parseCriblSearchMagic('%%cribl_search lang=kusto\ndataset=x | limit 1\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.lang).toBe('kql')
  })

  it('parses earliest and latest for the search API', () => {
    const r = parseCriblSearchMagic(
      '%%cribl_search earliest=-7d latest=now\ndataset=x | limit 1',
    )
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.earliest).toBe('-7d')
    expect(r.value.latest).toBe('now')
    expect(r.value.query).toBe('dataset=x | limit 1')
  })

  it('allows leading whitespace on first line', () => {
    const r = parseCriblSearchMagic('  %%cribl_search\nq\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.query).toBe('q')
  })

  it('skips leading # lines before the magic line', () => {
    const r = parseCriblSearchMagic('# note\n\n%%cribl_search\nq\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.query).toBe('q')
  })

  it('drops full-line # rows from the query body', () => {
    const r = parseCriblSearchMagic('%%cribl_search\nq\n# c\nr')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.query).toBe('q\nr')
  })

  it('keeps blank lines when removing # rows', () => {
    const r = parseCriblSearchMagic('%%cribl_search\nq\n\n# c\nr')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.query).toBe('q\n\nr')
  })

  it('errors on empty query', () => {
    const r = parseCriblSearchMagic('%%cribl_search\n')
    expect(r.kind).toBe('error')
  })

  it('errors when body is only full-line # comments', () => {
    expect(parseCriblSearchMagic('%%cribl_search\n# only\n').kind).toBe('error')
  })

  it('errors on bad var name', () => {
    const r = parseCriblSearchMagic('%%cribl_search var=1bad\nx\n')
    expect(r.kind).toBe('error')
  })

  it('parses limit for dataframe row cap', () => {
    const r = parseCriblSearchMagic('%%cribl_search limit=500\ndataset=x | limit 1\n')
    expect(r.kind).toBe('cribl_search')
    if (r.kind !== 'cribl_search') return
    expect(r.value.limit).toBe(500)
  })

  it('errors on non-integer limit', () => {
    const r = parseCriblSearchMagic('%%cribl_search limit=12.5\nq\n')
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/limit must be a non-negative integer/i)
  })

  it('errors on invalid lang value', () => {
    const r = parseCriblSearchMagic('%%cribl_search lang=spl\nq\n')
    expect(r.kind).toBe('error')
    if (r.kind === 'error') expect(r.message).toMatch(/lang must be one of kql, kusto, english/i)
  })

  it('parses template=on|off|auto and errors on bad value', () => {
    const onR = parseCriblSearchMagic('%%cribl_search template=on\nq\n')
    expect(onR.kind).toBe('cribl_search')
    if (onR.kind === 'cribl_search') expect(onR.value.template).toBe('on')
    const off = parseCriblSearchMagic('%%cribl_search template=off\ndataset=x | limit 1\n')
    expect(off.kind).toBe('cribl_search')
    if (off.kind === 'cribl_search') expect(off.value.template).toBe('off')
    const t = parseCriblSearchMagic('%%cribl_search template=true\nq\n')
    expect(t.kind).toBe('cribl_search')
    if (t.kind === 'cribl_search') expect(t.value.template).toBe('on')
    const bad = parseCriblSearchMagic('%%cribl_search template=maybe\nq\n')
    expect(bad.kind).toBe('error')
    if (bad.kind === 'error') expect(bad.message).toMatch(/template must be one of auto, on, off/i)
  })
})

describe('wantsCriblSearchJinjaTemplating + criblSearchQueryLooksLikeJinjaTemplate', () => {
  it('auto uses delimiters in the body', () => {
    expect(criblSearchQueryLooksLikeJinjaTemplate('dataset=x | where a == {{ b }}')).toBe(true)
    expect(criblSearchQueryLooksLikeJinjaTemplate('{% for x in y %}')).toBe(true)
    expect(criblSearchQueryLooksLikeJinjaTemplate('{# c #}')).toBe(true)
    expect(criblSearchQueryLooksLikeJinjaTemplate('dataset=x | limit 1')).toBe(false)
  })

  it('respects template mode', () => {
    expect(wantsCriblSearchJinjaTemplating('foo', 'off')).toBe(false)
    expect(wantsCriblSearchJinjaTemplating('foo', 'on')).toBe(true)
    expect(wantsCriblSearchJinjaTemplating('{{x}}', 'auto')).toBe(true)
    expect(wantsCriblSearchJinjaTemplating('x', 'auto')).toBe(false)
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
