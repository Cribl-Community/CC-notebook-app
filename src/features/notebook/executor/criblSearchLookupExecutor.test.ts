import { describe, it, expect, vi } from 'vitest'
import type { LookupService } from '@ports/LookupService'
import { CRIBL_LOOKUP_EXPORT_RESULT_KEY } from '@features/cribl-search/criblSearchLookupMagic'
import {
  createCriblSearchLookupExecutor,
  looksLikeCriblSearchLookupMagic,
} from '@features/notebook/executor/criblSearchLookupExecutor'
import type { CellId } from '@features/notebook/model/types'
import type { KernelPort } from '@ports/KernelPort'

const ctxBase = {
  cellId: 'c1' as CellId,
  executionCount: 2,
  emitIOPub: vi.fn(),
  isStale: () => false,
  dispatchNotebook: vi.fn(),
} as const

function makeKernel(execute: KernelPort['execute']): KernelPort {
  return {
    ready: Promise.resolve(),
    execute,
    complete: vi.fn(),
    interrupt: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  } satisfies KernelPort
}

function makeLookupService(partial: Partial<LookupService> = {}): LookupService {
  return {
    saveLookupFromCsv: vi.fn().mockResolvedValue(undefined),
    downloadLookupCsv: vi.fn().mockResolvedValue('x,y\n9,8\n'),
    deleteLookup: vi.fn().mockResolvedValue(undefined),
    ...partial,
  }
}

describe('looksLikeCriblSearchLookupMagic', () => {
  it('matches save and load headers', () => {
    expect(looksLikeCriblSearchLookupMagic('%%cribl_save_search_lookup a.csv')).toBe(true)
    expect(looksLikeCriblSearchLookupMagic('# h\n%%cribl_load_search_lookup a.csv')).toBe(true)
    expect(looksLikeCriblSearchLookupMagic('%%cribl_delete_search_lookup a.csv')).toBe(true)
    expect(looksLikeCriblSearchLookupMagic('%%cribl_search\nq\n')).toBe(false)
  })
})

describe('createCriblSearchLookupExecutor', () => {
  it('errors when CRIBL_API_URL is missing', async () => {
    const ex = createCriblSearchLookupExecutor({
      lookupService: makeLookupService(),
      criblApiBase: '',
    })
    const dispatch = vi.fn()
    const out = await ex.execute({
      ...ctxBase,
      source: '%%cribl_save_search_lookup a.csv',
      kernel: makeKernel(vi.fn()),
      dispatchNotebook: dispatch,
    })
    expect(out).toBe('error')
    expect(dispatch).toHaveBeenCalledWith({ type: 'ERROR_CELL', id: 'c1' })
  })

  it('save: exports dataframe then calls saveLookupFromCsv', async () => {
    const save = vi.fn<LookupService['saveLookupFromCsv']>().mockResolvedValue(undefined)
    const b64 = btoa('c,d\n1,2\n')
    const execute = vi.fn().mockResolvedValue({
      outputs: [
        {
          output_type: 'execute_result',
          execution_count: 2,
          data: {
            'application/json': JSON.stringify({
              [CRIBL_LOOKUP_EXPORT_RESULT_KEY]: { csv_b64: b64, rows: 1 },
            }),
          },
          metadata: {},
        },
      ],
    })
    const ex = createCriblSearchLookupExecutor({
      lookupService: makeLookupService({ saveLookupFromCsv: save }),
      criblApiBase: 'https://api.example/v1',
    })
    const out = await ex.execute({
      ...ctxBase,
      source: '%%cribl_save_search_lookup my.csv var=df replace=true',
      kernel: makeKernel(execute),
      dispatchNotebook: vi.fn(),
    })
    expect(out).toBe('ok')
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        lookupId: 'my.csv',
        replace: true,
        csvUtf8: 'c,d\n1,2\n',
      }),
    )
  })

  it('load: downloads then runs kernel assign', async () => {
    const download = vi.fn<LookupService['downloadLookupCsv']>().mockResolvedValue('p,q\n1,1\n')
    const execute = vi.fn().mockResolvedValue({ outputs: [] })
    const ex = createCriblSearchLookupExecutor({
      lookupService: makeLookupService({ downloadLookupCsv: download }),
      criblApiBase: 'https://api.example/v1',
    })
    const out = await ex.execute({
      ...ctxBase,
      source: '%%cribl_load_search_lookup z.csv var=qq',
      kernel: makeKernel(execute),
      dispatchNotebook: vi.fn(),
    })
    expect(out).toBe('ok')
    expect(download).toHaveBeenCalledWith({ group: 'default_search', lookupId: 'z.csv' })
    expect(execute).toHaveBeenCalled()
    const code = String(execute.mock.calls[0]![0])
    expect(code).toContain('qq')
    expect(code).toContain('pd.read_csv')
  })

  it('delete: calls deleteLookup', async () => {
    const del = vi.fn<LookupService['deleteLookup']>().mockResolvedValue(undefined)
    const ex = createCriblSearchLookupExecutor({
      lookupService: makeLookupService({ deleteLookup: del }),
      criblApiBase: 'https://api.example/v1',
    })
    const out = await ex.execute({
      ...ctxBase,
      source: '%%cribl_delete_search_lookup rm.csv group=default_search',
      kernel: makeKernel(vi.fn()),
      dispatchNotebook: vi.fn(),
    })
    expect(out).toBe('ok')
    expect(del).toHaveBeenCalledWith({ group: 'default_search', lookupId: 'rm.csv' })
  })
})
