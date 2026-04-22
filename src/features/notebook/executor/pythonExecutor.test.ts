import { describe, it, expect, vi } from 'vitest'
import { pythonExecutor } from './pythonExecutor'
import type { CellExecutionContext } from './cellExecutor'
import type { KernelPort } from '@ports/KernelPort'
import type { CellId } from '@features/notebook/model/types'

function makeKernel(onExecute: (cb: (msg: { msg_type: string } & Record<string, unknown>) => void) => void): KernelPort {
  return {
    ready: Promise.resolve(),
    execute: vi.fn().mockImplementation(async (_src: string, onMsg: (m: never) => void, _count: number) => {
      onExecute(onMsg as unknown as (cb: (msg: { msg_type: string } & Record<string, unknown>) => void) => void)
    }) as unknown as KernelPort['execute'],
    complete: vi.fn(),
    dispose: vi.fn(),
  }
}

function makeCtx(overrides: Partial<CellExecutionContext> = {}): CellExecutionContext {
  return {
    kernel: makeKernel(() => {}),
    cellId: 'c1' as CellId,
    source: 'print(1)',
    executionCount: 1,
    emitIOPub: vi.fn(),
    isStale: () => false,
    dispatchNotebook: vi.fn(),
    ...overrides,
  }
}

describe('pythonExecutor', () => {
  it('finishes cleanly on non-error run', async () => {
    const dispatch = vi.fn()
    const ctx = makeCtx({ dispatchNotebook: dispatch })
    const outcome = await pythonExecutor.execute(ctx)
    expect(outcome).toBe('ok')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FINISH_CELL', execution_count: 1 }),
    )
  })

  it('returns stale without dispatching on stale runs', async () => {
    const dispatch = vi.fn()
    const ctx = makeCtx({ dispatchNotebook: dispatch, isStale: () => true })
    const outcome = await pythonExecutor.execute(ctx)
    expect(outcome).toBe('stale')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('dispatches ERROR_CELL and returns error on kernel error msg', async () => {
    const dispatch = vi.fn()
    const emit = vi.fn()
    const kernel = makeKernel((emitIOPub) => {
      emitIOPub({ msg_type: 'error', ename: 'Boom', evalue: 'bad', traceback: [] })
    })
    const ctx = makeCtx({ kernel, dispatchNotebook: dispatch, emitIOPub: emit })
    const outcome = await pythonExecutor.execute(ctx)
    expect(outcome).toBe('error')
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'ERROR_CELL' }))
    expect(emit).toHaveBeenCalled()
  })
})
