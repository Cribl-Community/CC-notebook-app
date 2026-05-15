import { describe, it, expect } from 'vitest'
import {
  parseCriblSearchLookupMagic,
  extractLookupExportFromOutputs,
  CRIBL_LOOKUP_EXPORT_RESULT_KEY,
} from './criblSearchLookupMagic'

describe('parseCriblSearchLookupMagic', () => {
  it('parses save with positional lookup and defaults', () => {
    const r = parseCriblSearchLookupMagic('%%cribl_save_search_lookup my_lookup.csv')
    expect(r.kind).toBe('save')
    if (r.kind !== 'save') return
    expect(r.value.lookupId).toBe('my_lookup.csv')
    expect(r.value.varName).toBe('results_df')
    expect(r.value.replace).toBe(false)
    expect(r.value.mode).toBe('memory')
    expect(r.value.group).toBe('default_search')
  })

  it('parses save flags', () => {
    const r = parseCriblSearchLookupMagic(
      '%%cribl_save_search_lookup out.csv var=df replace=true mode=disk group=default_search',
    )
    expect(r.kind).toBe('save')
    if (r.kind !== 'save') return
    expect(r.value.varName).toBe('df')
    expect(r.value.replace).toBe(true)
    expect(r.value.mode).toBe('disk')
  })

  it('parses load', () => {
    const r = parseCriblSearchLookupMagic('%%cribl_load_search_lookup in.csv var=loaded')
    expect(r.kind).toBe('load')
    if (r.kind !== 'load') return
    expect(r.value.lookupId).toBe('in.csv')
    expect(r.value.varName).toBe('loaded')
  })

  it('parses delete', () => {
    const r = parseCriblSearchLookupMagic('%%cribl_delete_search_lookup trash.csv group=default_search')
    expect(r.kind).toBe('delete')
    if (r.kind !== 'delete') return
    expect(r.value.lookupId).toBe('trash.csv')
    expect(r.value.group).toBe('default_search')
  })

  it('errors on trailing body', () => {
    const r = parseCriblSearchLookupMagic('%%cribl_load_search_lookup x.csv\noops')
    expect(r.kind).toBe('error')
  })

  it('returns none for other cells', () => {
    expect(parseCriblSearchLookupMagic('%%cribl_search\nq\n').kind).toBe('none')
  })
})

describe('extractLookupExportFromOutputs', () => {
  it('reads nested csv bundle', () => {
    const b64 = btoa('a,b\n1,2\n')
    const inner = { csv_b64: b64, rows: 1 }
    const out = extractLookupExportFromOutputs([
      {
        output_type: 'execute_result',
        execution_count: 1,
        data: {
          'application/json': JSON.stringify({ [CRIBL_LOOKUP_EXPORT_RESULT_KEY]: inner }),
        },
        metadata: {},
      },
    ])
    expect(out?.csvUtf8).toBe('a,b\n1,2\n')
    expect(out?.rows).toBe(1)
  })
})
