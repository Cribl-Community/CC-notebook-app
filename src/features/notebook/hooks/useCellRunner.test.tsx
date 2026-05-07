import { describe, expect, it, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useCellRunner } from './useCellRunner'
import type { NotebookState } from '@features/notebook/model/types'
import type { WorkspaceState, WorkspaceAction, NotebookTab } from '@features/notebook/reducer/tabWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'
import type { KernelPort } from '@ports/KernelPort'

const runNotebookCellAfterReady = vi.fn()
vi.mock('@features/notebook/executor/runNotebookCell', () => ({
  runNotebookCellAfterReady: (...args: unknown[]) => runNotebookCellAfterReady(...args),
}))

function makeKernel(): KernelPort {
  return {
    ready: Promise.resolve(),
    execute: vi.fn().mockResolvedValue({ outputs: [] }),
    complete: vi.fn().mockResolvedValue([]),
    interrupt: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
  }
}

type RuntimeState = {
  kernel: KernelPort
  generation: number
  runQueue: { p: Promise<void> }
  scheduled: Set<string>
  executionCount: number
}

function makeRuntimeController(): {
  runtime: TabRuntimeController
  state: RuntimeState
  initKernelForTab: ReturnType<typeof vi.fn>
  interruptKernelForTab: ReturnType<typeof vi.fn>
} {
  const state: RuntimeState = {
    kernel: makeKernel(),
    generation: 1,
    runQueue: { p: Promise.resolve() },
    scheduled: new Set<string>(),
    executionCount: 0,
  }
  const initKernelForTab = vi.fn()
  const interruptKernelForTab = vi.fn()
  const runtime: TabRuntimeController = {
    get: () => ({
      kernel: state.kernel,
      generation: state.generation,
      runQueue: state.runQueue,
      executionCount: state.executionCount,
      scheduledIds: state.scheduled,
    }),
    kernelFor: () => state.kernel,
    generationOf: () => state.generation,
    bumpGeneration: () => {
      state.generation += 1
      return state.generation
    },
    runQueueOf: () => state.runQueue,
    executionCountOf: () => state.executionCount,
    setExecutionCount: (_id, count) => {
      state.executionCount = count
    },
    scheduledSetOf: () => state.scheduled,
    initKernelForTab,
    restartKernelForTab: vi.fn(),
    interruptKernelForTab,
    resetQueueState: vi.fn(),
    disposeTab: vi.fn(),
  }
  return { runtime, state, initKernelForTab, interruptKernelForTab }
}

function makeNotebookState(): NotebookState {
  return {
    title: 'Notebook',
    selectedId: 'c1',
    executionCounter: 0,
    kernelStatus: 'ready',
    kernelInit: {
      phase: 'ready',
      message: 'Python kernel ready',
      progressPercent: 100,
      startedAtMs: null,
      errorSummary: null,
      errorDetail: null,
    },
    cells: [
      { id: 'c1', cell_type: 'code', source: 'print(1)', execution_state: 'idle', outputs: [], execution_count: null },
      { id: 'c2', cell_type: 'code', source: 'print(2)', execution_state: 'idle', outputs: [], execution_count: null },
    ],
  }
}

function makeTab(state: NotebookState): NotebookTab {
  return {
    id: 't1',
    kind: 'notebook',
    notebook: state,
    lastSavedJson: '',
    kvNotebookId: null,
  }
}

describe('useCellRunner', () => {
  beforeEach(() => {
    runNotebookCellAfterReady.mockReset()
    runNotebookCellAfterReady.mockResolvedValue('ok')
  })

  it('runs a code cell through the runtime queue', async () => {
    const notebook = makeNotebookState()
    const workspace: WorkspaceState = { tabs: [makeTab(notebook)], activeTabId: 't1' }
    const workspaceRef = { current: workspace }
    const activeTabIdRef = { current: 't1' }
    const dispatch = vi.fn<(action: WorkspaceAction) => void>()
    const { runtime } = makeRuntimeController()

    const { result } = renderHook(() =>
      useCellRunner({
        runtime,
        workspaceRef: workspaceRef as never,
        activeTabIdRef: activeTabIdRef as never,
        dispatch,
        activeTab: workspace.tabs[0],
        state: notebook,
      }),
    )

    act(() => {
      result.current.runCell('c1')
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(runNotebookCellAfterReady).toHaveBeenCalledOnce()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'TAB_NOTEBOOK',
      tabId: 't1',
      action: { type: 'ENQUEUE_CELL', id: 'c1' },
    })
  })

  it('runAll enqueues each code cell', async () => {
    const notebook = makeNotebookState()
    const workspace: WorkspaceState = { tabs: [makeTab(notebook)], activeTabId: 't1' }
    const workspaceRef = { current: workspace }
    const activeTabIdRef = { current: 't1' }
    const dispatch = vi.fn<(action: WorkspaceAction) => void>()
    const { runtime } = makeRuntimeController()

    const { result } = renderHook(() =>
      useCellRunner({
        runtime,
        workspaceRef: workspaceRef as never,
        activeTabIdRef: activeTabIdRef as never,
        dispatch,
        activeTab: workspace.tabs[0],
        state: notebook,
      }),
    )

    act(() => {
      result.current.runAll()
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(runNotebookCellAfterReady).toHaveBeenCalledTimes(2)
  })

  it('stopExecution clears queue and interrupts kernel without re-init', () => {
    const notebook = makeNotebookState()
    notebook.cells = notebook.cells.map((cell, idx) =>
      idx === 0 && cell.cell_type === 'code'
        ? { ...cell, execution_state: 'running' }
        : cell,
    )
    const workspace: WorkspaceState = { tabs: [makeTab(notebook)], activeTabId: 't1' }
    const workspaceRef = { current: workspace }
    const activeTabIdRef = { current: 't1' }
    const dispatch = vi.fn<(action: WorkspaceAction) => void>()
    const { runtime, state, initKernelForTab, interruptKernelForTab } = makeRuntimeController()

    const { result } = renderHook(() =>
      useCellRunner({
        runtime,
        workspaceRef: workspaceRef as never,
        activeTabIdRef: activeTabIdRef as never,
        dispatch,
        activeTab: workspace.tabs[0],
        state: notebook,
      }),
    )

    act(() => {
      result.current.stopExecution()
    })

    expect(state.runQueue.p).toBeInstanceOf(Promise)
    expect(interruptKernelForTab).toHaveBeenCalledWith('t1')
    expect(initKernelForTab).not.toHaveBeenCalled()
    expect(state.kernel.dispose).not.toHaveBeenCalled()
    expect(dispatch).toHaveBeenCalledWith({
      type: 'TAB_NOTEBOOK',
      tabId: 't1',
      action: { type: 'SET_KERNEL_STATUS', status: 'ready' },
    })
  })
})
