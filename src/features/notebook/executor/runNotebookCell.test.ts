import { describe, it, expect, vi } from 'vitest'
import { runNotebookCellAfterReady } from '@features/notebook/executor/runNotebookCell'
import type { PyodideKernel } from '@platform/pyodide/PyodideKernel'
import type { IOPubMessage } from '@platform/pyodide/types'
import type { NotebookAction } from '@features/notebook/model/types'

function mockKernel(executeImpl: (
  code: string,
  onIOPub?: (msg: IOPubMessage) => void,
  executionCount?: number,
) => Promise<unknown>): PyodideKernel {
  return { execute: executeImpl } as unknown as PyodideKernel
}

describe('runNotebookCellAfterReady', () => {
  it('returns error when kernel execute reports IOPub error', async () => {
    const dispatched: NotebookAction[] = []
    const kernel = mockKernel(async (_code, onIOPub) => {
      onIOPub?.({
        msg_type: 'error',
        ename: 'ValueError',
        evalue: 'bad',
        traceback: ['Traceback'],
      })
      return {}
    })

    const out = await runNotebookCellAfterReady({
      kernel,
      cellId: 'c1',
      source: 'raise ValueError("bad")',
      executionCount: 1,
      emitIOPub: vi.fn(),
      isStale: () => false,
      dispatchNotebook: (a) => dispatched.push(a),
    })

    expect(out).toBe('error')
    expect(dispatched.some((a) => a.type === 'ERROR_CELL' && a.id === 'c1')).toBe(true)
  })

  it('returns ok when kernel completes without error IOPub', async () => {
    const dispatched: NotebookAction[] = []
    const kernel = mockKernel(async (_code, onIOPub) => {
      onIOPub?.({ msg_type: 'stream', name: 'stdout', text: 'hi\n' })
      return {}
    })

    const out = await runNotebookCellAfterReady({
      kernel,
      cellId: 'c1',
      source: 'print("hi")',
      executionCount: 1,
      emitIOPub: vi.fn(),
      isStale: () => false,
      dispatchNotebook: (a) => dispatched.push(a),
    })

    expect(out).toBe('ok')
    expect(dispatched.some((a) => a.type === 'FINISH_CELL' && a.id === 'c1')).toBe(true)
  })

  it('returns stale when isStale is true after execute', async () => {
    let stale = false
    const kernel = mockKernel(async (_code, onIOPub) => {
      stale = true
      onIOPub?.({ msg_type: 'stream', name: 'stdout', text: 'hi\n' })
      return {}
    })

    const out = await runNotebookCellAfterReady({
      kernel,
      cellId: 'c1',
      source: 'print("hi")',
      executionCount: 1,
      emitIOPub: vi.fn(),
      isStale: () => stale,
      dispatchNotebook: vi.fn(),
    })

    expect(out).toBe('stale')
  })
})
