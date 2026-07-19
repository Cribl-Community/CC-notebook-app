import { useCallback } from 'react'
import type { Dispatch } from 'react'
import { serializeNotebookToIpynbJson, titleToDownloadFilename } from '@features/notebook/codec/ipynb'
import {
  createChatTab,
  isNotebookTabKind,
  tabIsDirty,
  type NotebookTab,
  type WorkspaceAction,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import type { NotebookState } from '@features/notebook/model/types'
import type { MutableRefObject } from 'react'

export interface UseNotebookPageTabChromeArgs {
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
  showConfirm: (message: string) => Promise<boolean>
  activeTab: NotebookTab | undefined
  state: NotebookState | undefined
}

export function useNotebookPageTabChrome(args: UseNotebookPageTabChromeArgs) {
  const { workspaceRef, dispatch, showConfirm, activeTab, state } = args

  const handleDownload = useCallback(() => {
    if (!state || !activeTab || !isNotebookTabKind(activeTab.kind)) return
    const json = serializeNotebookToIpynbJson(state)
    const blob = new Blob([json], { type: 'application/x-ipynb+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = titleToDownloadFilename(state.title)
    a.rel = 'noopener'
    a.click()
    URL.revokeObjectURL(url)
  }, [state, activeTab])

  const handleCloseTab = useCallback(
    (tabId: string) => {
      const tab = workspaceRef.current.tabs.find((t) => t.id === tabId)
      if (!tab) return
      if (tabIsDirty(tab)) {
        void showConfirm('Discard unsaved changes in this tab?').then((ok) => {
          if (ok) dispatch({ type: 'CLOSE_TAB', tabId })
        })
        return
      }
      dispatch({ type: 'CLOSE_TAB', tabId })
    },
    [showConfirm, workspaceRef, dispatch],
  )

  const handleNewTab = useCallback(() => {
    dispatch({ type: 'ADD_TAB' })
  }, [dispatch])

  const handleSelectTab = useCallback(
    (tabId: string) => {
      dispatch({ type: 'SELECT_TAB', tabId })
    },
    [dispatch],
  )

  const handleNewNotebook = useCallback(() => {
    dispatch({ type: 'ADD_TAB' })
  }, [dispatch])

  const handleNewChatTab = useCallback(() => {
    dispatch({ type: 'ADD_TAB', tab: createChatTab() })
  }, [dispatch])

  return {
    handleDownload,
    handleCloseTab,
    handleNewTab,
    handleSelectTab,
    handleNewNotebook,
    handleNewChatTab,
  }
}
