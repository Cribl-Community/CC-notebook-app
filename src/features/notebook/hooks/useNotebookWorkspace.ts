import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { NotebookAction } from '@features/notebook/model/types'
import {
  createInitialWorkspace,
  tabIsDirty,
  tabWorkspaceReducer,
  type NotebookTab,
  type WorkspaceAction,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'

/**
 * Return shape for {@link useNotebookWorkspace}. Groups the workspace
 * reducer state with always-up-to-date refs (so event handlers can read
 * the latest state without re-creating closures on every render) and a
 * couple of convenience helpers (active tab, dirty flag, per-tab dispatch).
 */
export interface NotebookWorkspaceController {
  workspace: WorkspaceState
  dispatch: Dispatch<WorkspaceAction>
  /** Ref mirror of `workspace` for async callbacks that must see the latest value. */
  workspaceRef: MutableRefObject<WorkspaceState>
  /** Ref mirror of `workspace.activeTabId` for the same reason. */
  activeTabIdRef: MutableRefObject<string>
  activeTab: NotebookTab
  /** Stable string key of all tab ids (useful as a React effect dependency). */
  tabIdsKey: string
  /** True when the active tab has unsaved changes relative to its last-saved snapshot. */
  dirty: boolean
  /** Dispatch a notebook action targeting the currently active tab. */
  dispatchNotebook: (action: NotebookAction) => void
  /** Dispatch a notebook action targeting a specific tab. */
  dispatchNotebookForTab: (tabId: string, action: NotebookAction) => void
}

/**
 * Owns the tab-workspace reducer and exposes refs + helpers that previously
 * lived inline in NotebookPage. Keeping this in a dedicated hook lets us
 * unit-test the orchestration separately and keeps NotebookPage focused on
 * composition.
 */
export function useNotebookWorkspace(): NotebookWorkspaceController {
  const [workspace, dispatch] = useReducer(
    tabWorkspaceReducer,
    undefined,
    () => createInitialWorkspace(),
  )

  const workspaceRef = useRef(workspace)
  const activeTabIdRef = useRef(workspace.activeTabId)
  useEffect(() => {
    workspaceRef.current = workspace
    activeTabIdRef.current = workspace.activeTabId
  })

  const activeTab = useMemo(
    () => workspace.tabs.find((t) => t.id === workspace.activeTabId) ?? workspace.tabs[0],
    [workspace.tabs, workspace.activeTabId],
  )

  const tabIdsKey = useMemo(
    () => workspace.tabs.map((t) => t.id).join(','),
    [workspace.tabs],
  )

  const dirty = activeTab ? tabIsDirty(activeTab) : false

  const dispatchNotebook = useCallback((action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId: activeTabIdRef.current, action })
  }, [])

  const dispatchNotebookForTab = useCallback((tabId: string, action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId, action })
  }, [])

  return {
    workspace,
    dispatch,
    workspaceRef,
    activeTabIdRef,
    activeTab,
    tabIdsKey,
    dirty,
    dispatchNotebook,
    dispatchNotebookForTab,
  }
}
