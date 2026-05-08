import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage } from '@ports/KernelPort'
import type { CellId, NotebookAction } from '@features/notebook/model/types'
import type { CellExecutor, CellRunOutcome } from './cellExecutor'
import { selectExecutor } from './cellExecutor'
import { DEFAULT_CELL_EXECUTORS } from './executorRegistry'
import { pythonExecutor } from './pythonExecutor'

export type { CellRunOutcome } from './cellExecutor'

/**
 * Runs one code cell after the kernel is ready. Looks up the right
 * executor from the registry (cribl-search magic vs. plain Python) and
 * delegates. Caller owns queueing, SET_RUNNING, execution counter, and
 * kernel busy/ready UI flags.
 */
export async function runNotebookCellAfterReady(opts: {
  kernel: KernelPort
  cellId: CellId
  source: string
  executionCount: number
  emitIOPub: (msg: IOPubMessage) => void
  /** True when this run was superseded (e.g. kernel restart). */
  isStale: () => boolean
  dispatchNotebook: (action: NotebookAction) => void
  /** Override the executor registry (tests + future plug-ins). */
  executors?: readonly CellExecutor[]
}): Promise<CellRunOutcome> {
  const {
    kernel,
    cellId,
    source,
    executionCount,
    emitIOPub,
    isStale,
    dispatchNotebook,
    executors = DEFAULT_CELL_EXECUTORS,
  } = opts

  const executor = selectExecutor(source, executors) ?? pythonExecutor
  return executor.execute({
    kernel,
    cellId,
    source,
    executionCount,
    emitIOPub,
    isStale,
    dispatchNotebook,
  })
}
