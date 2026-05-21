import { describe, it, expect, vi } from 'vitest'
import type { SearchService } from '@ports/SearchService'
import { DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS } from '@/domain/search'
import { createCriblSearchExecutor } from './criblSearchExecutor'
import type { CellId } from '@features/notebook/model/types'
import type { KernelPort } from '@ports/KernelPort'
import { CRIBL_SEARCH_MIME } from '@/domain/criblSearchMime'
import { planCriblSearchDataframeHydration } from '@features/cribl-search/criblSearchDataframeHydration'
import { parseCriblSearchMagic } from '@features/cribl-search/criblSearchMagic'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import { runCriblSearchJinjaInKernel } from '@features/cribl-search/criblSearchJinjaRender'
import { wantsCriblSearchJinjaTemplating } from '@features/cribl-search/criblSearchMagic'

const ctx = {
  cellId: 'c1' as CellId,
  source: '',
  executionCount: 3,
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

function makeSearchService(partial: Partial<SearchService> = {}): SearchService {
  return {
    runSearch: vi.fn().mockResolvedValue({ rows: [], columns: ['a'], totalRecords: 0 }),
    translateEnglishToKql: vi.fn(),
    ...partial,
  }
}

const baseDeps = {
  parseCriblSearchMagic,
  planCriblSearchDataframeHydration,
  filterPyodidePackageChatter,
  searchService: makeSearchService(),
  criblApiBase: '',
  criblSearchMaxRows: DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS,
  wantsCriblSearchJinjaTemplating,
  runCriblSearchJinjaInKernel: vi.fn<typeof runCriblSearchJinjaInKernel>(),
} satisfies Parameters<typeof createCriblSearchExecutor>[0]

describe('createCriblSearchExecutor', () => {
  it('skips Jinja when wantsCriblSearchJinjaTemplating is off', async () => {
    const jinja = vi.fn(baseDeps.runCriblSearchJinjaInKernel)
    const ex = createCriblSearchExecutor({ ...baseDeps, runCriblSearchJinjaInKernel: jinja })
    const source = '%%cribl_search\ndataset=x | limit 1\n'
    const execute = vi.fn().mockImplementation(async () => ({ outputs: [] }))
    await ex.execute({
      ...ctx,
      source,
      kernel: makeKernel(execute),
    })
    expect(execute).toHaveBeenCalled()
    expect(execute.mock.calls[0]![2]).toBe(3)
    expect(jinja).not.toHaveBeenCalled()
  })

  it('calls runCriblSearchJinjaInKernel and passes the rendered query to the search job', async () => {
    const jinja = vi
      .fn<typeof runCriblSearchJinjaInKernel>()
      .mockResolvedValue({ ok: true, text: 'rendered|q' } as Awaited<ReturnType<typeof runCriblSearchJinjaInKernel>>)
    const runSearch = vi.fn<SearchService['runSearch']>().mockResolvedValue({
      rows: [],
      columns: ['a'],
      totalRecords: 0,
    })
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      runCriblSearchJinjaInKernel: jinja,
      searchService: makeSearchService({ runSearch }),
    })
    const source = '%%cribl_search\nwhere a == {{ v }}\n'
    const kernel = makeKernel(vi.fn().mockImplementation(async () => ({ outputs: [] })))
    const out = await ex.execute({ ...ctx, source, kernel })
    expect(jinja).toHaveBeenCalledWith(
      kernel,
      'where a == {{ v }}',
      expect.objectContaining({ executionCount: 0, emitIOPub: ctx.emitIOPub }),
    )
    expect(runSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'rendered|q' }))
    expect(out).toBe('ok')
  })

  it('emits failed output immediately for cors/network errors', async () => {
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({
        runSearch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      }),
    })
    const emitIOPub = vi.fn()
    const dispatchNotebook = vi.fn()
    const out = await ex.execute({
      ...ctx,
      source: '%%cribl_search\ndataset=x | limit 1\n',
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
      emitIOPub,
      dispatchNotebook,
      isStale: () => false,
    })

    expect(out).toBe('error')
    expect(dispatchNotebook).toHaveBeenCalledWith({ type: 'ERROR_CELL', id: 'c1' })
    const failed = emitIOPub.mock.calls.find(
      (call) => call[0]?.msg_type === 'update_display_data' && String(call[0]?.data?.['text/plain']).includes('failed'),
    )?.[0]
    expect(failed).toBeTruthy()
    expect(JSON.stringify(failed?.data)).toContain('not retried')
  })

  it('emits JSON response preview as application/json display_data', async () => {
    const runSearch = vi.fn<SearchService['runSearch']>().mockResolvedValue({
      rows: [{ id: 1, name: 'alpha' }],
      columns: ['id', 'name'],
      totalRecords: 1,
    })
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({ runSearch }),
    })
    const emitIOPub = vi.fn()
    const out = await ex.execute({
      ...ctx,
      source: '%%cribl_search response=json\nid=1\n',
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
      emitIOPub,
    })

    expect(out).toBe('ok')
    const jsonDisplay = emitIOPub.mock.calls.find(
      (call) => call[0]?.msg_type === 'display_data' && typeof call[0]?.data?.['application/json'] === 'string',
    )?.[0]
    expect(jsonDisplay).toBeTruthy()
    expect(String(jsonDisplay?.data?.['application/json'])).toContain('"name": "alpha"')
  })

  it('lang=english translate_only=true does not run search and emits translate-only completion', async () => {
    const translate = vi.fn<SearchService['translateEnglishToKql']>().mockResolvedValue('dataset=x | limit 99')
    const runSearch = vi.fn<SearchService['runSearch']>()
    const emitIOPub = vi.fn()
    const dispatchNotebook = vi.fn()
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({ translateEnglishToKql: translate, runSearch }),
      criblApiBase: 'https://api.example/v1',
    })
    const source =
      '%%cribl_search lang=english translate_only=true dataset=cribl_search_sample\nshow me stuff\n'
    const out = await ex.execute({
      ...ctx,
      source,
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
      emitIOPub,
      dispatchNotebook,
    })

    expect(out).toBe('ok')
    expect(translate).toHaveBeenCalledWith('show me stuff', { datasetHint: 'cribl_search_sample' })
    expect(runSearch).not.toHaveBeenCalled()
    expect(dispatchNotebook).toHaveBeenCalledWith({ type: 'FINISH_CELL', id: 'c1', execution_count: 3 })
    const completed = emitIOPub.mock.calls.find((call) => {
      const d = call[0]?.data?.[CRIBL_SEARCH_MIME]
      if (typeof d !== 'string') return false
      try {
        const p = JSON.parse(d) as { kind?: string; translateOnly?: boolean }
        return p.kind === 'completed' && p.translateOnly === true
      } catch {
        return false
      }
    })?.[0]
    expect(completed).toBeTruthy()
    const stdout = emitIOPub.mock.calls.find(
      (call) => call[0]?.msg_type === 'stream' && call[0]?.name === 'stdout',
    )?.[0]
    expect(String(stdout?.text)).toContain('dataset=x | limit 99')
  })

  it('lang=english without translate_only still runs search after translation', async () => {
    const translate = vi.fn<SearchService['translateEnglishToKql']>().mockResolvedValue('dataset=x | limit 2')
    const runSearch = vi.fn<SearchService['runSearch']>().mockResolvedValue({
      rows: [{ a: 1 }],
      columns: ['a'],
      totalRecords: 1,
    })
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({ translateEnglishToKql: translate, runSearch }),
      criblApiBase: 'https://api.example/v1',
    })
    const source = '%%cribl_search lang=english\nnatural language prompt\n'
    await ex.execute({
      ...ctx,
      source,
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
    })

    expect(translate).toHaveBeenCalled()
    expect(runSearch).toHaveBeenCalledWith(expect.objectContaining({ query: 'dataset=x | limit 2' }))
  })

  it('falls back to built-in English→KQL when AI translate fails with a network error', async () => {
    const translate = vi.fn<SearchService['translateEnglishToKql']>().mockRejectedValue(new TypeError('Failed to fetch'))
    const runSearch = vi.fn<SearchService['runSearch']>().mockResolvedValue({
      rows: [],
      columns: [],
      totalRecords: 0,
    })
    const emitIOPub = vi.fn()
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({ translateEnglishToKql: translate, runSearch }),
      criblApiBase: 'https://api.example/v1',
    })
    const source =
      '%%cribl_search lang=english translate_only=true dataset=cribl_search_sample\nShow the 80 most recent entries\n'
    const out = await ex.execute({
      ...ctx,
      source,
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
      emitIOPub,
      dispatchNotebook: vi.fn(),
    })

    expect(out).toBe('ok')
    expect(translate).toHaveBeenCalled()
    const stderr = emitIOPub.mock.calls.find(
      (c) => c[0]?.msg_type === 'stream' && c[0]?.name === 'stderr' && String(c[0]?.text).includes('built-in preview'),
    )?.[0]
    expect(stderr).toBeTruthy()
    const stdout = emitIOPub.mock.calls.find(
      (call) => call[0]?.msg_type === 'stream' && call[0]?.name === 'stdout',
    )?.[0]
    expect(String(stdout?.text)).toContain('dataset=cribl_search_sample | sort by _time desc | limit 80')
    expect(runSearch).not.toHaveBeenCalled()
  })

  it('after AI translate network fallback, still runs search with stub KQL', async () => {
    const translate = vi.fn<SearchService['translateEnglishToKql']>().mockRejectedValue(new TypeError('Failed to fetch'))
    const runSearch = vi.fn<SearchService['runSearch']>().mockResolvedValue({
      rows: [{ x: 1 }],
      columns: ['x'],
      totalRecords: 1,
    })
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      searchService: makeSearchService({ translateEnglishToKql: translate, runSearch }),
      criblApiBase: 'https://api.example/v1',
    })
    const source =
      '%%cribl_search lang=english dataset=cribl_search_sample earliest=-1h latest=now\nShow the 5 most recent entries\n'
    await ex.execute({
      ...ctx,
      source,
      kernel: makeKernel(vi.fn().mockResolvedValue({ outputs: [] })),
    })

    expect(runSearch).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'dataset=cribl_search_sample | sort by _time desc | limit 5' }),
    )
  })
})
