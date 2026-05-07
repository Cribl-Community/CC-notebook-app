import { describe, it, expect, vi } from 'vitest'
import { createCriblSearchExecutor } from './criblSearchExecutor'
import type { CellId } from '@features/notebook/model/types'
import type { KernelPort } from '@ports/KernelPort'
import { DEFAULT_CRIBL_SEARCH_MAX_ROWS, runCriblSearchJob } from '@platform/cribl/searchJobs'
import { translateEnglishToKql } from '@platform/cribl/aiTranslate'
import { getCriblApiBase } from '@platform/cribl/kvstore'
import {
  buildCriblSearchDataframeCode,
  encodeRowsJsonForPythonBase64,
  parseCriblSearchMagic,
} from '@features/cribl-search/criblSearchMagic'
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
    dispose: vi.fn(),
  } satisfies KernelPort
}

const baseDeps = {
  parseCriblSearchMagic,
  buildCriblSearchDataframeCode,
  encodeRowsJsonForPythonBase64,
  filterPyodidePackageChatter,
  runCriblSearchJob: vi
    .fn<typeof runCriblSearchJob>()
    .mockResolvedValue({ rows: [], columns: ['a'], totalRecords: 0 }),
  translateEnglishToKql: vi.fn<typeof translateEnglishToKql>(),
  getCriblApiBase: vi.fn<typeof getCriblApiBase>().mockReturnValue(''),
  criblSearchMaxRows: DEFAULT_CRIBL_SEARCH_MAX_ROWS,
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
    const job = vi.fn<typeof runCriblSearchJob>().mockResolvedValue({ rows: [], columns: ['a'], totalRecords: 0 })
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      runCriblSearchJinjaInKernel: jinja,
      runCriblSearchJob: job,
    })
    const source = '%%cribl_search\nwhere a == {{ v }}\n'
    const kernel = makeKernel(vi.fn().mockImplementation(async () => ({ outputs: [] })))
    const out = await ex.execute({ ...ctx, source, kernel })
    expect(jinja).toHaveBeenCalledWith(
      kernel,
      'where a == {{ v }}',
      expect.objectContaining({ executionCount: 0, emitIOPub: ctx.emitIOPub }),
    )
    expect(job).toHaveBeenCalledWith(expect.objectContaining({ query: 'rendered|q' }))
    expect(out).toBe('ok')
  })

  it('emits failed output immediately for cors/network errors', async () => {
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      runCriblSearchJob: vi.fn<typeof runCriblSearchJob>().mockRejectedValue(new TypeError('Failed to fetch')),
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
    const ex = createCriblSearchExecutor({
      ...baseDeps,
      runCriblSearchJob: vi
        .fn<typeof runCriblSearchJob>()
        .mockResolvedValue({ rows: [{ id: 1, name: 'alpha' }], columns: ['id', 'name'], totalRecords: 1 }),
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
})
