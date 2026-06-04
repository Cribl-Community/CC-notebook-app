import type { Dispatch, MutableRefObject } from 'react'
import type { IOPubMessage, KernelPort } from '@ports/KernelPort'
import type { CellId, NotebookAction } from '@features/notebook/model/types'
import { isCommIOPubMessage } from '@/domain/kernel'
import { runNotebookCellAfterReady } from '@features/notebook/executor/runNotebookCell'
import { evaluateCellRunCondition } from '@features/notebook/executor/cellConditionEval'
import { normalizeRunCondition } from '@features/notebook/codeCellFold'
import { RunQueueAbortedError } from '@features/notebook/executor/runQueueAbort'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'
import type { CellExecutor } from '@features/notebook/executor/cellExecutor'

export interface QueuedCellRunParams {
  tabId: string
  cellId: CellId
  /** Kernel captured when the run was scheduled (same reference as original queue closure). */
  kernel: KernelPort
  /** Generation captured when the run was scheduled; stale if it changes. */
  generationAtSchedule: number
  /** Optional Run All batch id for abort coordination. */
  runAllBatch: number | undefined
  runtime: TabRuntimeController
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
  scheduled: Set<CellId>
  /** Initial source snapshot (fallback if cell missing mid-run). */
  fallbackSource: string
  executors: readonly CellExecutor[]
}

/**
 * Body of one serialized queue step: condition eval, execute, reducer updates.
 * Caller is responsible for chaining onto `runQueueOf(tabId).p` and for
 * pre-queue validation (welcome tab, kernel present, etc.).
 */
export async function runQueuedNotebookCell(params: QueuedCellRunParams): Promise<void> {
  const {
    tabId: tid,
    cellId: id,
    kernel,
    generationAtSchedule: myGen,
    runAllBatch,
    runtime,
    workspaceRef,
    dispatch,
    scheduled,
    fallbackSource: source,
    executors: cellExecutors,
  } = params

  if (runtime.generationOf(tid) !== myGen) {
    scheduled.delete(id)
    return
  }

  if (runAllBatch != null && runtime.shouldSkipQueuedRunAllCell(tid, runAllBatch)) {
    scheduled.delete(id)
    return
  }

  try {
    await kernel.ready
    if (runtime.generationOf(tid) !== myGen) return

    const tabNow = workspaceRef.current.tabs.find((t) => t.id === tid)
    const cellNow = tabNow?.notebook.cells.find((c) => c.id === id)
    const runExpr =
      cellNow?.cell_type === 'code' ? normalizeRunCondition(cellNow.runCondition) : 'True'

    const cond = await evaluateCellRunCondition(kernel, runExpr)
    if (runtime.generationOf(tid) !== myGen) return

    dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: tid,
      action: { type: 'SET_CONDITION_OUTCOME', id, outcome: cond.outcome },
    })

    if (cond.skipBody) {
      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SKIP_CELL_TO_IDLE', id } })
      return
    }

    dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_RUNNING', id } })

    const tabForSource = workspaceRef.current.tabs.find((t) => t.id === tid)
    const cellForSource = tabForSource?.notebook.cells.find((c) => c.id === id)
    const bodySource = cellForSource?.cell_type === 'code' ? cellForSource.source : source

    dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: tid,
      action: { type: 'SET_KERNEL_STATUS', status: 'busy' },
    })
    const count = runtime.executionCountOf(tid) + 1
    runtime.setExecutionCount(tid, count)

    const emitIOPub = (msg: IOPubMessage) => {
      if (runtime.generationOf(tid) !== myGen) return
      if (isCommIOPubMessage(msg)) {
        runtime.widgetManagerFor(tid)?.handleKernelIOPub(msg)
        return
      }
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: { type: 'IOPUB', id, msg, executionCount: count },
      })
    }

    const dispatchTabNotebook = (action: NotebookAction) => {
      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action })
    }

    const outcome = await runNotebookCellAfterReady({
      kernel,
      cellId: id,
      source: bodySource,
      executionCount: count,
      emitIOPub,
      isStale: () => runtime.generationOf(tid) !== myGen,
      dispatchNotebook: dispatchTabNotebook,
      executors: cellExecutors,
    })
    if (outcome === 'error') {
      runtime.scheduledSetOf(tid).clear()
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: { type: 'CLEAR_ALL_PENDING' },
      })
      if (runAllBatch != null) {
        runtime.abortRunAllBatch(tid, runAllBatch)
      }
      throw new RunQueueAbortedError()
    }
  } catch (e) {
    if (e instanceof RunQueueAbortedError) {
      return
    }
    if (runtime.generationOf(tid) === myGen) {
      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
      runtime.scheduledSetOf(tid).clear()
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: { type: 'CLEAR_ALL_PENDING' },
      })
      if (runAllBatch != null) {
        runtime.abortRunAllBatch(tid, runAllBatch)
      }
    }
    throw new RunQueueAbortedError()
  } finally {
    scheduled.delete(id)
    if (runtime.generationOf(tid) === myGen) {
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: { type: 'SET_KERNEL_STATUS', status: 'ready' },
      })
    }
  }
}
