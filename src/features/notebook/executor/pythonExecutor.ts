import type { CellExecutionContext, CellExecutor, CellRunOutcome } from './cellExecutor'

/**
 * Default executor for plain Python cells. Delegates to the kernel and
 * watches for error messages coming back on IOPub so the reducer can mark
 * the cell failed and the run queue can halt.
 */
export const pythonExecutor: CellExecutor = {
  name: 'python',
  matches: () => true,
  async execute(ctx: CellExecutionContext): Promise<CellRunOutcome> {
    const { kernel, cellId: id, source, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
    let sawError = false
    await kernel.execute(
      source,
      (msg) => {
        if (msg.msg_type === 'error') sawError = true
        emitIOPub(msg)
      },
      count,
    )

    if (isStale()) return 'stale'

    if (sawError) {
      dispatchNotebook({ type: 'ERROR_CELL', id })
      return 'error'
    }
    dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
    return 'ok'
  },
}
