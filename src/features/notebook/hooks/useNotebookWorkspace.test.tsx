import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useNotebookWorkspace } from './useNotebookWorkspace'

describe('useNotebookWorkspace', () => {
  it('initialises with a welcome tab and keeps refs up to date', () => {
    const { result, rerender } = renderHook(() => useNotebookWorkspace())

    expect(result.current.workspace.tabs.length).toBeGreaterThan(0)
    expect(result.current.activeTab).toBeDefined()
    expect(result.current.workspaceRef.current).toBe(result.current.workspace)
    expect(result.current.activeTabIdRef.current).toBe(result.current.workspace.activeTabId)
    expect(result.current.tabIdsKey).toBe(
      result.current.workspace.tabs.map((t) => t.id).join(','),
    )

    const initialActiveId = result.current.workspace.activeTabId
    rerender()
    expect(result.current.activeTabIdRef.current).toBe(initialActiveId)
  })

  it('dispatchNotebookForTab updates the targeted tab', () => {
    const { result } = renderHook(() => useNotebookWorkspace())

    act(() => {
      result.current.dispatch({
        type: 'ADD_TAB',
        tab: {
          id: 'nb-1',
          kind: 'notebook',
          notebook: {
            title: 'Untitled',
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
          },
          lastSavedJson: '',
          kvNotebookId: null,
        },
      })
    })

    act(() => {
      result.current.dispatchNotebookForTab('nb-1', { type: 'SET_NOTEBOOK_TITLE', title: 'Renamed' })
    })

    const tab = result.current.workspace.tabs.find((t) => t.id === 'nb-1')
    expect(tab?.notebook.title).toBe('Renamed')
  })

  it('tabIdsKey reflects tab order changes', () => {
    const { result } = renderHook(() => useNotebookWorkspace())
    const before = result.current.tabIdsKey

    act(() => {
      result.current.dispatch({
        type: 'ADD_TAB',
        tab: {
          id: 'extra-tab',
          kind: 'notebook',
          notebook: result.current.activeTab.notebook,
          lastSavedJson: '',
          kvNotebookId: null,
        },
      })
    })

    expect(result.current.tabIdsKey).not.toBe(before)
    expect(result.current.tabIdsKey.split(',')).toContain('extra-tab')
  })
})
