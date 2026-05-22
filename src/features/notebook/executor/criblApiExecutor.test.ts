import { describe, it, expect, vi } from 'vitest'
import type { CriblApiHttpResult, CriblApiExecutorDeps } from './criblApiExecutor'
import { describeFetchError } from '@platform/cribl/fetchFailure'
import {
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiNoneAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
  encodeUtf8TextForPythonBase64,
  encodeValueJsonForPythonBase64,
  parseCriblApiMagic,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
} from '@features/cribl-api/criblApiMagic'
import { runNotebookJinjaInKernel } from '@features/notebook/jinjaInKernel'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import type { CellId } from '@features/notebook/model/types'
import type { KernelPort } from '@ports/KernelPort'
import { createCriblApiExecutor } from './criblApiExecutor'

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

const baseDeps = {
  parseCriblApiMagic,
  getCriblApiBase: vi.fn<() => string>().mockReturnValue('https://h/api/v1'),
  runNotebookJinjaInKernel: vi
    .fn<typeof runNotebookJinjaInKernel>()
    .mockResolvedValue({ ok: true, text: 'a: 1' }),
  filterPyodidePackageChatter,
  callCriblApi: vi.fn<CriblApiExecutorDeps['callCriblApi']>().mockResolvedValue({
    status: 200,
    ok: true,
    text: '{}',
    jsonValue: {} as never,
  }),
  describeFetchError,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
  encodeValueJsonForPythonBase64,
  encodeUtf8TextForPythonBase64,
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiNoneAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
} satisfies Parameters<typeof createCriblApiExecutor>[0]

describe('createCriblApiExecutor', () => {
  it('fails when no Cribl API base is configured', async () => {
    const callCribl = vi.fn<CriblApiExecutorDeps['callCriblApi']>()
    const ex = createCriblApiExecutor({ ...baseDeps, getCriblApiBase: () => '', callCriblApi: callCribl })
    const out = await ex.execute({
      ...ctx,
      source: '%%cribl_api GET /system/info var=x\n',
      kernel: makeKernel(vi.fn()),
    })
    expect(out).toBe('error')
    expect(callCribl).not.toHaveBeenCalled()
  })

  it('skips Jinja for literal YAML when auto mode and no jinja lookalikes', async () => {
    const jinja = vi.fn(baseDeps.runNotebookJinjaInKernel)
    const ex = createCriblApiExecutor({ ...baseDeps, runNotebookJinjaInKernel: jinja })
    const execute = vi.fn().mockResolvedValue({ outputs: [] })
    const source = '%%cribl_api GET /m/x var=out\n'
    await ex.execute({ ...ctx, source, kernel: makeKernel(execute) })
    expect(jinja).not.toHaveBeenCalled()
  })

  it('calls the API and assigns JSON into the kernel', async () => {
    const emitIOPub = vi.fn()
    const api = vi.fn<CriblApiExecutorDeps['callCriblApi']>().mockImplementation(async (method, path) => {
      expect(method).toBe('GET')
      expect(path).toBe('/m/jobs')
      return { status: 200, ok: true, text: '{"items":1}', jsonValue: { items: 1 } }
    })
    const ex = createCriblApiExecutor({ ...baseDeps, callCriblApi: api })
    const execute = vi.fn().mockResolvedValue({ outputs: [] })
    const r = await ex.execute({
      ...ctx,
      emitIOPub,
      source: '%%cribl_api GET /m/jobs var=z\n',
      kernel: makeKernel(execute),
    })
    expect(r).toBe('ok')
    expect(api).toHaveBeenCalled()
    const firstCode = execute.mock.calls[0]![0] as string
    expect(firstCode).toContain('json.loads')
    const previewDisplay = emitIOPub.mock.calls.find((call) => call[0]?.msg_type === 'display_data')?.[0]
    expect(previewDisplay).toBeTruthy()
    expect(previewDisplay?.data?.['application/json']).toContain('"items": 1')
  })

  it('treats HTTP 4xx as error and does not finish the cell as ok', async () => {
    const api = vi.fn<CriblApiExecutorDeps['callCriblApi']>().mockResolvedValue({
      status: 400,
      ok: false,
      text: 'bad',
      jsonValue: null,
    } satisfies CriblApiHttpResult)
    const ex = createCriblApiExecutor({ ...baseDeps, callCriblApi: api })
    const r = await ex.execute({
      ...ctx,
      source: '%%cribl_api GET /x var=o\n',
      kernel: makeKernel(vi.fn()),
    })
    expect(r).toBe('error')
  })

  it('completes ok with stderr when ignoreFailure=true on HTTP error', async () => {
    const emitIOPub = vi.fn()
    const dispatchNotebook = vi.fn()
    const api = vi.fn<CriblApiExecutorDeps['callCriblApi']>().mockResolvedValue({
      status: 500,
      ok: false,
      text: '{"status":"error","message":"Entity missing"}',
      jsonValue: { status: 'error', message: 'Entity missing' },
    } satisfies CriblApiHttpResult)
    const execute = vi.fn().mockResolvedValue({ outputs: [] })
    const ex = createCriblApiExecutor({ ...baseDeps, callCriblApi: api })
    const r = await ex.execute({
      ...ctx,
      emitIOPub,
      dispatchNotebook,
      source: '%%cribl_api DELETE /m/x var=o ignoreFailure=true\n',
      kernel: makeKernel(execute),
    })
    expect(r).toBe('ok')
    const stderr = emitIOPub.mock.calls.find((call) => call[0]?.msg_type === 'stream' && call[0]?.name === 'stderr')?.[0]
    expect(stderr?.text).toContain('HTTP 500')
    expect(execute.mock.calls[0]![0]).toContain('o = None')
    expect(dispatchNotebook).toHaveBeenCalledWith(expect.objectContaining({ type: 'FINISH_CELL' }))
    expect(dispatchNotebook).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR_CELL' }))
  })

  it('surfaces cors/network failures in stderr without retry', async () => {
    const emitIOPub = vi.fn()
    const ex = createCriblApiExecutor({
      ...baseDeps,
      callCriblApi: vi.fn<CriblApiExecutorDeps['callCriblApi']>().mockRejectedValue(new TypeError('Failed to fetch')),
    })
    const r = await ex.execute({
      ...ctx,
      emitIOPub,
      source: '%%cribl_api GET /x var=o\n',
      kernel: makeKernel(vi.fn()),
    })
    expect(r).toBe('error')
    const stderr = emitIOPub.mock.calls.find((call) => call[0]?.msg_type === 'stream' && call[0]?.name === 'stderr')?.[0]
    expect(stderr?.text).toContain('not retried')
  })
})
