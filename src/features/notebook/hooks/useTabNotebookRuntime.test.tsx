import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useRef } from 'react'
import type { KernelInitProgress, KernelPort } from '@ports/KernelPort'
import { useTabNotebookRuntime } from './useTabNotebookRuntime'
import type { NotebookTab, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { CellId, NotebookState } from '@features/notebook/model/types'

function emptyNotebookState(): NotebookState {
  return {
    title: 'x',
    cells: [],
    selectedId: null,
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
  }
}

function makeTab(id: string, kind: 'welcome' | 'notebook' = 'notebook'): NotebookTab {
  return {
    id,
    kind,
    notebook: emptyNotebookState(),
    lastSavedJson: '',
    kvNotebookId: null,
  }
}

function createFakeKernel(): KernelPort {
  return {
    ready: Promise.resolve(),
    execute: vi.fn().mockResolvedValue({ outputs: [] }),
    complete: vi.fn().mockResolvedValue([]),
    interrupt: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    setInitProgressListener: vi.fn(),
    getLastInitError: vi.fn().mockReturnValue(null),
  }
}

describe('useTabNotebookRuntime', () => {
  it('initialises a kernel per notebook tab and skips welcome tabs', () => {
    const dispatch = vi.fn()
    const factory = vi.fn(createFakeKernel)
    const workspace: WorkspaceState = {
      tabs: [makeTab('t1', 'welcome'), makeTab('t2', 'notebook')],
      activeTabId: 't2',
    }

    renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 't1,t2', factory)
    })

    expect(factory).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TAB_NOTEBOOK',
        tabId: 't2',
        action: { type: 'SET_KERNEL_STATUS', status: 'loading' },
      }),
    )
  })

  it('bumpGeneration increments and restart disposes then reinits', () => {
    const dispatch = vi.fn()
    const kernel1 = createFakeKernel()
    const kernel2 = createFakeKernel()
    const factory = vi.fn().mockReturnValueOnce(kernel1).mockReturnValueOnce(kernel2)
    const workspace: WorkspaceState = {
      tabs: [makeTab('a')],
      activeTabId: 'a',
    }

    const { result } = renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 'a', factory)
    })

    expect(factory).toHaveBeenCalledTimes(1)
    const g0 = result.current.generationOf('a')
    act(() => {
      result.current.bumpGeneration('a')
    })
    expect(result.current.generationOf('a')).toBe(g0 + 1)

    act(() => {
      result.current.restartKernelForTab('a')
    })
    expect(kernel1.dispose).toHaveBeenCalled()
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('interruptKernelForTab calls interrupt on the active kernel without disposing', () => {
    const dispatch = vi.fn()
    const kernel = createFakeKernel()
    const factory = vi.fn(() => kernel)
    const workspace: WorkspaceState = {
      tabs: [makeTab('a')],
      activeTabId: 'a',
    }

    const { result } = renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 'a', factory)
    })

    act(() => {
      result.current.interruptKernelForTab('a')
    })

    expect(kernel.interrupt).toHaveBeenCalledTimes(1)
    expect(kernel.dispose).not.toHaveBeenCalled()
  })

  it('tracks execution count and scheduled ids per tab', () => {
    const dispatch = vi.fn()
    const workspace: WorkspaceState = {
      tabs: [makeTab('x')],
      activeTabId: 'x',
    }

    const { result } = renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 'x', createFakeKernel)
    })

    expect(result.current.executionCountOf('x')).toBe(0)
    act(() => result.current.setExecutionCount('x', 7))
    expect(result.current.executionCountOf('x')).toBe(7)

    const scheduled = result.current.scheduledSetOf('x')
    const cellId = 'cell-1' as CellId
    scheduled.add(cellId)
    expect(result.current.scheduledSetOf('x').has(cellId)).toBe(true)
  })

  it('dispatches kernel init progress updates from kernel events', () => {
    const dispatch = vi.fn()
    const workspace: WorkspaceState = {
      tabs: [makeTab('x')],
      activeTabId: 'x',
    }
    let progressListener: ((progress: KernelInitProgress) => void) | undefined
    const kernel: KernelPort = {
      ready: Promise.resolve(),
      execute: vi.fn().mockResolvedValue({ outputs: [] }),
      complete: vi.fn().mockResolvedValue([]),
      interrupt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      setInitProgressListener: (listener) => {
        progressListener = listener ?? undefined
      },
      getLastInitError: () => null,
    }
    const factory = vi.fn(() => kernel)

    renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 'x', factory)
    })

    if (typeof progressListener !== 'function') throw new Error('expected init progress listener')
    progressListener({ phase: 'runtime', message: 'Loading Python runtime', progressPercent: 45 })
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TAB_NOTEBOOK',
        tabId: 'x',
        action: {
          type: 'SET_KERNEL_INIT_PROGRESS',
          phase: 'runtime',
          message: 'Loading Python runtime',
          progressPercent: 45,
        },
      }),
    )
  })

  it('dispatches detailed init error when kernel startup fails', async () => {
    const dispatch = vi.fn()
    const workspace: WorkspaceState = {
      tabs: [makeTab('x')],
      activeTabId: 'x',
    }
    const kernel: KernelPort = {
      ready: Promise.reject(new Error('init failed')),
      execute: vi.fn().mockResolvedValue({ outputs: [] }),
      complete: vi.fn().mockResolvedValue([]),
      interrupt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
      setInitProgressListener: vi.fn(),
      getLastInitError: () => ({ summary: 'Worker import failed', detail: 'stack details' }),
    }
    const factory = vi.fn(() => kernel)

    renderHook(() => {
      const ref = useRef(workspace)
      return useTabNotebookRuntime(dispatch, ref, 'x', factory)
    })

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TAB_NOTEBOOK',
        tabId: 'x',
        action: {
          type: 'SET_KERNEL_INIT_ERROR',
          summary: 'Worker import failed',
          detail: 'stack details',
        },
      }),
    )
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'TAB_NOTEBOOK',
        tabId: 'x',
        action: { type: 'SET_KERNEL_STATUS', status: 'error' },
      }),
    )
  })
})
