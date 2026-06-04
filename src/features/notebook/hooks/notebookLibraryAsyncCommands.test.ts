import { describe, it, expect, vi } from 'vitest'
import type { Dispatch, MutableRefObject } from 'react'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import { saveCurrentTabNotebook } from './notebookLibraryAsyncCommands'
import type { NotebookRepo } from '@ports/NotebookRepo'
import type { Manifest } from '@/domain/library'
import type { KernelInitState } from '@features/notebook/model/types'

function ref<T>(v: T): MutableRefObject<T> {
  return { current: v }
}

const readyKernelInit: KernelInitState = {
  phase: 'ready',
  message: 'Python kernel ready',
  progressPercent: 100,
  startedAtMs: null,
  errorSummary: null,
  errorDetail: null,
}

describe('notebookLibraryAsyncCommands', () => {
  it('saveCurrentTabNotebook updates manifest when tab already has kv id', async () => {
    const repo: NotebookRepo = {
      readManifest: vi.fn(),
      writeManifest: vi.fn(),
      readPayload: vi.fn(),
      writePayload: vi.fn(),
      deletePayload: vi.fn(),
    }
    const manifest: Manifest = { version: 1, items: [] }
    const setManifest = vi.fn()
    const loadLibrary = vi.fn().mockResolvedValue(undefined)
    const showAlert = vi.fn()
    const dispatch = vi.fn() as Dispatch<WorkspaceAction>

    const tabId = 'tab1'
    const workspaceRef = ref<WorkspaceState>({
      tabs: [
        {
          id: tabId,
          kind: 'notebook',
          kvNotebookId: 'nb99',
          lastSavedJson: '',
          notebook: {
            title: 'Hi',
            cells: [{ id: 'c1', cell_type: 'markdown', source: 'x', editing: false }],
            selectedId: 'c1',
            executionCounter: 0,
            kernelStatus: 'ready',
            kernelInit: readyKernelInit,
          },
        },
      ],
      activeTabId: tabId,
    })

    await saveCurrentTabNotebook({
      repo,
      tabId,
      workspaceRef,
      manifest,
      selectedParentId: null,
      dispatch,
      setManifest,
      loadLibrary,
      showAlert,
    })

    expect(repo.writePayload).toHaveBeenCalled()
    expect(repo.writeManifest).toHaveBeenCalled()
    expect(setManifest).toHaveBeenCalled()
    expect(loadLibrary).toHaveBeenCalled()
    expect(showAlert).not.toHaveBeenCalled()
  })
})
