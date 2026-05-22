import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { KernelFactory, KernelPort } from '@ports/KernelPort'
import { useOptionalKernelFactory } from '@app/providers'
import type { CellId } from '@features/notebook/model/types'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { NotebookWidgetManager } from '@features/notebook/widgets/notebookWidgetManager'

/**
 * Per-tab runtime state. Previously the hook exposed five parallel
 * `useRef<Map<string, X>>` maps, one per concern. Collapsing them into a
 * single record keyed by `tabId` makes lifecycle clean-up trivial (delete
 * the record → everything disappears at once) and gives consumers a typed
 * accessor surface via {@link TabRuntimeController}.
 */
export interface TabRuntime {
  /** Active Pyodide kernel for the tab, or null before init / after dispose. */
  kernel: KernelPort | null
  /** Live ipywidgets bridge; null until the kernel finishes booting. */
  widgetManager: NotebookWidgetManager | null
  /**
   * Generation counter bumped on every restart/stop so in-flight runs can
   * detect and bail if they outlive their kernel.
   */
  generation: number
  /** Serialized run queue (a chainable Promise). One cell runs at a time. */
  runQueue: { p: Promise<void> }
  /** Last execution_count returned by the kernel for this tab. */
  executionCount: number
  /** Set of cell ids currently scheduled or running; used to de-dupe clicks. */
  scheduledIds: Set<CellId>
  /**
   * Monotonic id issued at each Run All start; queued cells capture it so later
   * cells can no-op after an earlier cell in the same batch errors.
   */
  runAllBatchId: number
  /** When equal to a cell's captured batch id, that Run All batch was aborted. */
  abortedRunAllBatchId: number | null
}

export interface TabRuntimeController {
  /** Read (or lazily initialise) the runtime record for a tab. */
  get(tabId: string): TabRuntime
  kernelFor(tabId: string): KernelPort | null
  generationOf(tabId: string): number
  bumpGeneration(tabId: string): number
  runQueueOf(tabId: string): { p: Promise<void> }
  executionCountOf(tabId: string): number
  setExecutionCount(tabId: string, count: number): void
  scheduledSetOf(tabId: string): Set<CellId>
  /** Fire-and-forget: start a kernel for the tab if one is not already active. */
  initKernelForTab(tabId: string): void
  /** Dispose the current kernel, clear per-tab state, then start a fresh kernel. */
  restartKernelForTab(tabId: string): void
  /** Signal interrupt on the active kernel without disposing it (KeyboardInterrupt when supported). */
  interruptKernelForTab(tabId: string): void
  /** Drop the run queue, reset execution count and scheduled set. Does NOT bump gen. */
  resetQueueState(tabId: string): void
  /** Dispose the kernel if present and forget the tab entirely. */
  disposeTab(tabId: string): void
  widgetManagerFor(tabId: string): NotebookWidgetManager | null
  /** Start a new Run All batch; returns the id cells should capture. */
  beginRunAllBatch(tabId: string): number
  /** Mark every remaining cell in this Run All batch as cancelled (after a cell error). */
  abortRunAllBatch(tabId: string, batchId: number): void
  /** True when this cell was queued for Run All and a prior cell in the same batch failed. */
  shouldSkipQueuedRunAllCell(tabId: string, batchId: number | undefined): boolean
}

function makeTabRuntime(): TabRuntime {
  return {
    kernel: null,
    widgetManager: null,
    generation: 0,
    runQueue: { p: Promise.resolve() },
    executionCount: 0,
    scheduledIds: new Set<CellId>(),
    runAllBatchId: 0,
    abortedRunAllBatchId: null,
  }
}

/**
 * Per-tab Pyodide kernel plus serialized execution queue and generation
 * counter. Accepts a KernelFactory for tests and so features don't depend on
 * the Pyodide adapter directly.
 */
export function useTabNotebookRuntime(
  dispatch: Dispatch<WorkspaceAction>,
  workspaceRef: MutableRefObject<WorkspaceState>,
  tabIdsKey: string,
  kernelFactoryArg?: KernelFactory,
): TabRuntimeController {
  const kernelFactoryFromContext = useOptionalKernelFactory()
  const kernelFactory = kernelFactoryArg ?? kernelFactoryFromContext
  if (!kernelFactory) {
    throw new Error(
      'Notebook kernel factory missing: wrap the tree with <KernelProvider> or pass a KernelFactory as the fourth argument (tests).',
    )
  }

  const runtimesRef = useRef<Map<string, TabRuntime>>(new Map())

  const get = useCallback((tabId: string): TabRuntime => {
    const m = runtimesRef.current
    let r = m.get(tabId)
    if (!r) {
      r = makeTabRuntime()
      m.set(tabId, r)
    }
    return r
  }, [])

  const initKernelForTab = useCallback(
    (tabId: string) => {
      const r = get(tabId)
      const gen = r.generation + 1
      r.generation = gen
      dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'loading' } })
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId,
        action: {
          type: 'SET_KERNEL_INIT_PROGRESS',
          phase: 'boot',
          message: 'Preparing kernel runtime',
          progressPercent: 0,
        },
      })
      const kernel = kernelFactory()
      r.kernel = kernel
      kernel.setInitProgressListener?.((progress) => {
        if (r.generation !== gen) return
        dispatch({
          type: 'TAB_NOTEBOOK',
          tabId,
          action: {
            type: 'SET_KERNEL_INIT_PROGRESS',
            phase: progress.phase,
            message: progress.message,
            progressPercent: progress.progressPercent,
          },
        })
      })
      kernel.ready
        .then(async () => {
          if (r.generation === gen) {
            r.widgetManager?.disconnect()
            const { NotebookWidgetManager } = await import(
              '@features/notebook/widgets/notebookWidgetManager'
            )
            r.widgetManager = new NotebookWidgetManager(kernel)
            dispatch({
              type: 'TAB_NOTEBOOK',
              tabId,
              action: { type: 'SET_KERNEL_STATUS', status: 'ready' },
            })
          }
        })
        .catch((err: unknown) => {
          if (r.generation === gen) {
            r.widgetManager?.disconnect()
            r.widgetManager = null
            const initErr = kernel.getLastInitError?.()
            const fallbackSummary = err instanceof Error ? err.message : 'Kernel startup failed'
            const fallbackDetail =
              err instanceof Error && err.stack ? err.stack : err != null ? String(err) : null
            dispatch({
              type: 'TAB_NOTEBOOK',
              tabId,
              action: {
                type: 'SET_KERNEL_INIT_ERROR',
                summary: initErr?.summary ?? fallbackSummary,
                detail: initErr?.detail ?? fallbackDetail,
              },
            })
            dispatch({
              type: 'TAB_NOTEBOOK',
              tabId,
              action: { type: 'SET_KERNEL_STATUS', status: 'error' },
            })
          }
        })
    },
    [dispatch, kernelFactory, get],
  )

  const resetQueueState = useCallback(
    (tabId: string) => {
      const r = get(tabId)
      r.runQueue.p = Promise.resolve()
      r.executionCount = 0
      r.scheduledIds.clear()
      r.abortedRunAllBatchId = null
    },
    [get],
  )

  const restartKernelForTab = useCallback(
    (tabId: string) => {
      const r = get(tabId)
      r.widgetManager?.disconnect()
      r.widgetManager = null
      r.kernel?.dispose()
      r.kernel = null
      r.runQueue.p = Promise.resolve()
      r.executionCount = 0
      r.scheduledIds.clear()
      r.abortedRunAllBatchId = null
      dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'RESTART' } })
      initKernelForTab(tabId)
    },
    [dispatch, initKernelForTab, get],
  )

  const interruptKernelForTab = useCallback(
    (tabId: string) => {
      const k = get(tabId).kernel
      void k?.interrupt()
    },
    [get],
  )

  const disposeTab = useCallback((tabId: string) => {
    const m = runtimesRef.current
    const r = m.get(tabId)
    if (!r) return
    r.widgetManager?.disconnect()
    r.widgetManager = null
    r.kernel?.dispose()
    m.delete(tabId)
  }, [])

  useEffect(() => {
    const tabs = workspaceRef.current.tabs
    const ids = new Set(tabs.map((t) => t.id))
    for (const id of [...runtimesRef.current.keys()]) {
      if (!ids.has(id)) disposeTab(id)
    }
    for (const tab of tabs) {
      if (tab.kind === 'welcome') continue
      if (!runtimesRef.current.get(tab.id)?.kernel) {
        initKernelForTab(tab.id)
      }
    }
  }, [tabIdsKey, initKernelForTab, workspaceRef, disposeTab])

  const controller = useMemo<TabRuntimeController>(
    () => ({
      get,
      kernelFor: (tabId) => get(tabId).kernel,
      generationOf: (tabId) => get(tabId).generation,
      bumpGeneration: (tabId) => {
        const r = get(tabId)
        r.generation += 1
        return r.generation
      },
      runQueueOf: (tabId) => get(tabId).runQueue,
      executionCountOf: (tabId) => get(tabId).executionCount,
      setExecutionCount: (tabId, count) => {
        get(tabId).executionCount = count
      },
      scheduledSetOf: (tabId) => get(tabId).scheduledIds,
      beginRunAllBatch: (tabId) => {
        const r = get(tabId)
        r.runAllBatchId += 1
        r.abortedRunAllBatchId = null
        return r.runAllBatchId
      },
      abortRunAllBatch: (tabId, batchId) => {
        get(tabId).abortedRunAllBatchId = batchId
      },
      shouldSkipQueuedRunAllCell: (tabId, batchId) => {
        if (batchId == null) return false
        return get(tabId).abortedRunAllBatchId === batchId
      },
      initKernelForTab,
      restartKernelForTab,
      interruptKernelForTab,
      resetQueueState,
      disposeTab,
      widgetManagerFor: (tabId) => get(tabId).widgetManager,
    }),
    [get, initKernelForTab, restartKernelForTab, interruptKernelForTab, resetQueueState, disposeTab],
  )

  return controller
}
