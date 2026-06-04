import type { Dispatch, MutableRefObject } from 'react'
import type { NotebookWorkspaceController } from '@features/notebook/hooks/useNotebookWorkspace'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'

/** Sync open tab titles when a library notebook entry is renamed in KV. */
export function updateOpenTabTitles(
  workspaceRef: MutableRefObject<WorkspaceState>,
  dispatchNotebookForTab: NotebookWorkspaceController['dispatchNotebookForTab'],
  notebookId: string,
  name: string,
): void {
  for (const tab of workspaceRef.current.tabs) {
    if (tab.kvNotebookId === notebookId) {
      dispatchNotebookForTab(tab.id, { type: 'SET_NOTEBOOK_TITLE', title: name })
    }
  }
}

/** Close any tabs whose `kvNotebookId` was deleted from the library. */
export function closeDeletedTabs(
  dispatch: Dispatch<WorkspaceAction>,
  workspaceRef: MutableRefObject<WorkspaceState>,
  deletedNotebookIds: Set<string>,
): void {
  for (const tab of [...workspaceRef.current.tabs]) {
    if (tab.kvNotebookId && deletedNotebookIds.has(tab.kvNotebookId)) {
      dispatch({ type: 'CLOSE_TAB', tabId: tab.id })
    }
  }
}
