import { useCallback, useMemo } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { IOPubMessage } from '@ports/KernelPort'
import type { CellId, NotebookAction, NotebookState } from '@features/notebook/model/types'
import { isCommIOPubMessage } from '@/domain/kernel'
import { runNotebookCellAfterReady } from '@features/notebook/executor/runNotebookCell'
import { createDefaultCellExecutors } from '@features/notebook/executor/executorRegistry'
import { RunQueueAbortedError } from '@features/notebook/executor/runQueueAbort'
import type { WorkspaceAction, WorkspaceState, NotebookTab } from '@features/notebook/reducer/tabWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'
// eslint-disable-next-line no-restricted-imports -- notebook runtime reads ports from composition root
import { useEnv, useLookupService, useSearchService } from '@app/providers'

export interface CellRunnerController {
  /** Enqueue one cell for execution on its tab's kernel. */
  runCell: (id: CellId) => void
  /**
   * Run `id` then move the selection to the next cell (or append a new code cell
   * at the end). Mirrors Shift-Enter semantics in classic Jupyter.
   */
  runCellAndAdvance: (id: CellId, cellIndex: number) => void
  /** Enqueue every code cell on the active tab in document order. */
  runAll: () => void
  /** Restart the kernel on the active tab. No-op for welcome tabs. */
  restartKernel: () => void
  /**
   * Stop the current run on the active tab: bump generation, drop the queue,
   * interrupt the kernel (KeyboardInterrupt when supported), clear pending cells,
   * and mark any running cell as stopped — without disposing or re-initializing the kernel.
   */
  stopExecution: () => void
  /**
   * True when there's something meaningful to stop: kernel busy or a cell
   * pending/running on the active tab.
   */
  canStopExecution: boolean
}

export interface UseCellRunnerArgs {
  runtime: TabRuntimeController
  workspaceRef: MutableRefObject<WorkspaceState>
  activeTabIdRef: MutableRefObject<string>
  dispatch: Dispatch<WorkspaceAction>
  activeTab: NotebookTab | undefined
  state: NotebookState | undefined
}

/**
 * Owns the cell-execution flow that used to live inline in NotebookPage.
 * It is wired against the TabRuntimeController (for kernel + per-tab queue)
 * and the workspace dispatch; everything else is inlined so tests can drive
 * run/stop/restart without standing up the whole page.
 */
export function useCellRunner(args: UseCellRunnerArgs): CellRunnerController {
  const { runtime, workspaceRef, activeTabIdRef, dispatch, activeTab, state } = args
  const { apiBase } = useEnv()
  const searchService = useSearchService()
  const lookupService = useLookupService()
  const cellExecutors = useMemo(
    () => createDefaultCellExecutors(searchService, apiBase, lookupService),
    [searchService, apiBase, lookupService],
  )

  const runCell = useCallback(
    (id: CellId, runAllBatch?: number) => {
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return
      const kernel = runtime.kernelFor(tid)
      if (!kernel) return

      const cell = tab.notebook.cells.find((c) => c.id === id)
      if (!cell || cell.cell_type !== 'code') return
      const source = cell.source
      const myGen = runtime.generationOf(tid)

      const scheduled = runtime.scheduledSetOf(tid)
      if (scheduled.has(id)) return
      scheduled.add(id)

      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ENQUEUE_CELL', id } })

      const q = runtime.runQueueOf(tid)
      q.p = q.p
        .then(async () => {
          if (runtime.generationOf(tid) !== myGen) {
            scheduled.delete(id)
            return
          }

          if (runAllBatch != null && runtime.shouldSkipQueuedRunAllCell(tid, runAllBatch)) {
            scheduled.delete(id)
            return
          }

          dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_RUNNING', id } })

          try {
            await kernel.ready
            if (runtime.generationOf(tid) !== myGen) return

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
              source,
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
        })
        .catch((e) => {
          if (e instanceof RunQueueAbortedError) return
          console.error(e)
        })
    },
    [runtime, workspaceRef, activeTabIdRef, dispatch, cellExecutors],
  )

  const runCellAndAdvance = useCallback(
    (id: CellId, cellIndex: number) => {
      runCell(id)
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return
      const cells = tab.notebook.cells
      if (cellIndex < cells.length - 1) {
        dispatch({
          type: 'TAB_NOTEBOOK',
          tabId: tid,
          action: { type: 'SELECT_CELL', id: cells[cellIndex + 1]!.id },
        })
      } else {
        dispatch({
          type: 'TAB_NOTEBOOK',
          tabId: tid,
          action: { type: 'ADD_CELL', afterId: id, cellType: 'code' },
        })
      }
    },
    [runCell, workspaceRef, activeTabIdRef, dispatch],
  )

  const runAll = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (!tab || tab.kind === 'welcome') return
    const batchId = runtime.beginRunAllBatch(tid)
    tab.notebook.cells
      .filter((c) => c.cell_type === 'code')
      .forEach((cell) => runCell(cell.id, batchId))
  }, [runCell, runtime, workspaceRef, activeTabIdRef])

  const restartKernel = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (tab?.kind === 'welcome') return
    runtime.restartKernelForTab(tid)
  }, [runtime, workspaceRef, activeTabIdRef])

  const stopExecution = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab0 = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (tab0?.kind === 'welcome') return
    runtime.bumpGeneration(tid)
    runtime.scheduledSetOf(tid).clear()
    dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'CLEAR_ALL_PENDING' } })

    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    const runningId = tab?.notebook.cells.find(
      (c) => c.cell_type === 'code' && c.execution_state === 'running',
    )?.id

    const r = runtime.get(tid)
    runtime.interruptKernelForTab(tid)
    r.runQueue.p = Promise.resolve()

    if (runningId) {
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: {
          type: 'IOPUB',
          id: runningId,
          msg: { msg_type: 'stream', name: 'stderr', text: 'Execution stopped.\n' },
          executionCount: null,
        },
      })
      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id: runningId } })
    }

    dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: tid,
      action: { type: 'SET_KERNEL_STATUS', status: 'ready' },
    })
  }, [runtime, workspaceRef, activeTabIdRef, dispatch])

  const canStopExecution = useMemo(() => {
    if (!activeTab || activeTab.kind === 'welcome') return false
    if (!state) return false
    if (state.kernelStatus === 'loading' || state.kernelStatus === 'error') return false
    if (state.kernelStatus === 'busy') return true
    return state.cells.some(
      (c) =>
        c.cell_type === 'code' &&
        (c.execution_state === 'running' || c.execution_state === 'pending'),
    )
  }, [state, activeTab])

  return { runCell, runCellAndAdvance, runAll, restartKernel, stopExecution, canStopExecution }
}
