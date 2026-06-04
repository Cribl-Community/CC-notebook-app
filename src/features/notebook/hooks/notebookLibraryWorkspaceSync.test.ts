import { describe, it, expect, vi } from 'vitest'
import type { MutableRefObject } from 'react'
import { updateOpenTabTitles, closeDeletedTabs } from './notebookLibraryWorkspaceSync'
import type { WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { KernelInitState } from '@features/notebook/model/types'

function makeWorkspace(tabs: WorkspaceState['tabs']): MutableRefObject<WorkspaceState> {
  return { current: { tabs, activeTabId: tabs[0]?.id ?? '' } }
}

const readyKernelInit: KernelInitState = {
  phase: 'ready',
  message: 'Python kernel ready',
  progressPercent: 100,
  startedAtMs: null,
  errorSummary: null,
  errorDetail: null,
}

describe('notebookLibraryWorkspaceSync', () => {
  it('updateOpenTabTitles dispatches title for matching kv ids', () => {
    const dispatchNotebookForTab = vi.fn()
    const workspaceRef = makeWorkspace([
      {
        id: 't1',
        kind: 'notebook',
        kvNotebookId: 'nb-1',
        lastSavedJson: '',
        notebook: {
          title: 'Old',
          cells: [],
          selectedId: null,
          executionCounter: 0,
          kernelStatus: 'ready',
          kernelInit: readyKernelInit,
        },
      },
      {
        id: 't2',
        kind: 'notebook',
        kvNotebookId: 'nb-2',
        lastSavedJson: '',
        notebook: {
          title: 'Other',
          cells: [],
          selectedId: null,
          executionCounter: 0,
          kernelStatus: 'ready',
          kernelInit: readyKernelInit,
        },
      },
    ])

    updateOpenTabTitles(workspaceRef, dispatchNotebookForTab, 'nb-1', 'Renamed')

    expect(dispatchNotebookForTab).toHaveBeenCalledTimes(1)
    expect(dispatchNotebookForTab).toHaveBeenCalledWith('t1', { type: 'SET_NOTEBOOK_TITLE', title: 'Renamed' })
  })

  it('closeDeletedTabs closes tabs whose kvNotebookId is in the delete set', () => {
    const dispatch = vi.fn()
    const workspaceRef = makeWorkspace([
      {
        id: 't1',
        kind: 'notebook',
        kvNotebookId: 'gone',
        lastSavedJson: '',
        notebook: {
          title: 'A',
          cells: [],
          selectedId: null,
          executionCounter: 0,
          kernelStatus: 'ready',
          kernelInit: readyKernelInit,
        },
      },
      {
        id: 't2',
        kind: 'notebook',
        kvNotebookId: 'keep',
        lastSavedJson: '',
        notebook: {
          title: 'B',
          cells: [],
          selectedId: null,
          executionCounter: 0,
          kernelStatus: 'ready',
          kernelInit: readyKernelInit,
        },
      },
    ])

    closeDeletedTabs(dispatch, workspaceRef, new Set(['gone']))

    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(dispatch).toHaveBeenCalledWith({ type: 'CLOSE_TAB', tabId: 't1' })
  })
})
