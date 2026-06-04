import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useNotebookPageTabChrome } from './useNotebookPageTabChrome'
import type { WorkspaceState } from '@features/notebook/reducer/tabWorkspace'

describe('useNotebookPageTabChrome', () => {
  it('handleNewTab dispatches ADD_TAB', () => {
    const dispatch = vi.fn()
    const workspaceRef = {
      current: { tabs: [], activeTabId: '' } as WorkspaceState,
    }
    const showConfirm = vi.fn()

    const { result } = renderHook(() =>
      useNotebookPageTabChrome({
        workspaceRef,
        dispatch,
        showConfirm,
        activeTab: undefined,
        state: undefined,
      }),
    )

    act(() => {
      result.current.handleNewTab()
    })

    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_TAB' })
  })
})
