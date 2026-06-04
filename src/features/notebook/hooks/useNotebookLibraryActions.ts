import { useCallback } from 'react'
import { createEmptyTab } from '@features/notebook/reducer/tabWorkspace'
import { useEnv, useNotebookRepo } from '@app/providers'
import type { NotebookWorkspaceController } from '@features/notebook/hooks/useNotebookWorkspace'
import type { NotebookLibraryController } from '@features/library'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'
import {
  confirmMoveLibraryEntry,
  createFolderInManifest,
  deleteLibraryEntry,
  importNotebookFileToTab,
  loadExampleNotebookToTab,
  openNotebookFromKv,
  renameLibraryEntry,
  saveCurrentTabNotebook,
  setNotebookTagsInManifest,
} from '@features/notebook/hooks/notebookLibraryAsyncCommands'

export interface NotebookLibraryActionsArgs {
  workspace: NotebookWorkspaceController
  runtime: TabRuntimeController
  library: NotebookLibraryController
  showAlert: (message: string) => void
  showConfirm: (message: string) => Promise<boolean>
  showPrompt: (title: string, label: string, defaultValue?: string) => Promise<string | null>
}

export function useNotebookLibraryActions(args: NotebookLibraryActionsArgs) {
  const { workspace, runtime, library, showAlert, showConfirm, showPrompt } = args
  const { staticAssetPrefix } = useEnv()
  const repo = useNotebookRepo()
  const {
    dispatch,
    workspaceRef,
    activeTabIdRef,
    dispatchNotebookForTab,
  } = workspace
  const {
    manifest,
    selectedParentId,
    setManifest,
    loading: libraryLoading,
    setSaveBusy,
    reload: loadLibrary,
    setMovingId,
  } = library

  const handleSave = useCallback(() => {
    const tabId = activeTabIdRef.current
    const tab0 = workspaceRef.current.tabs.find((t) => t.id === tabId)
    if (tab0?.kind === 'welcome') return
    if (!manifest) {
      void loadLibrary()
      return
    }
    if (!tab0) return

    void (async () => {
      setSaveBusy(true)
      try {
        await saveCurrentTabNotebook({
          repo,
          tabId,
          workspaceRef,
          manifest,
          selectedParentId,
          dispatch,
          setManifest,
          loadLibrary,
          showAlert,
        })
      } finally {
        setSaveBusy(false)
      }
    })()
  }, [
    activeTabIdRef,
    dispatch,
    loadLibrary,
    manifest,
    repo,
    selectedParentId,
    setManifest,
    setSaveBusy,
    showAlert,
    workspaceRef,
  ])

  const handleOpenNotebook = useCallback(
    (id: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void openNotebookFromKv({
        repo,
        tabId: tab.id,
        notebookId: id,
        dispatch,
        loadLibrary,
        showAlert,
      })
    },
    [dispatch, loadLibrary, repo, showAlert],
  )

  const handleNewFolder = useCallback(
    (parentId: string | null) => {
      if (!manifest) return
      void (async () => {
        const name = await showPrompt('New folder', 'Folder name', '')
        if (name === null) return
        await createFolderInManifest({
          repo,
          manifest,
          parentId,
          name,
          setManifest,
          loadLibrary,
          showAlert,
        })
      })()
    },
    [loadLibrary, manifest, repo, setManifest, showAlert, showPrompt],
  )

  const handleRename = useCallback(
    (id: string, currentName: string) => {
      if (!manifest) return
      void (async () => {
        const name = await showPrompt('Rename', 'New name', currentName)
        if (name === null) return
        await renameLibraryEntry({
          repo,
          manifest,
          itemId: id,
          newName: name,
          workspaceRef,
          dispatchNotebookForTab,
          setManifest,
          loadLibrary,
          showAlert,
        })
      })()
    },
    [dispatchNotebookForTab, loadLibrary, manifest, repo, setManifest, showAlert, showPrompt, workspaceRef],
  )

  const handleEditNotebookTags = useCallback(
    (id: string, currentTags: string[]) => {
      if (!manifest) return
      void (async () => {
        const raw = await showPrompt(
          'Notebook tags',
          'Comma-separated (leave empty to clear)',
          currentTags.join(', '),
        )
        if (raw === null) return
        await setNotebookTagsInManifest({
          repo,
          manifest,
          notebookId: id,
          tags: raw.split(','),
          setManifest,
          loadLibrary,
          showAlert,
        })
      })()
    },
    [loadLibrary, manifest, repo, setManifest, showAlert, showPrompt],
  )

  const handleDelete = useCallback(
    (id: string, name: string, kind: 'folder' | 'notebook') => {
      if (!manifest) return
      const label = kind === 'folder' ? `folder “${name}” and everything inside it` : `“${name}”`
      void showConfirm(`Delete ${label}? This cannot be undone.`).then((ok) => {
        if (!ok) return
        void deleteLibraryEntry({
          repo,
          manifest,
          itemId: id,
          dispatch,
          workspaceRef,
          setManifest,
          loadLibrary,
          showAlert,
        })
      })
    },
    [dispatch, loadLibrary, manifest, repo, setManifest, showAlert, showConfirm, workspaceRef],
  )

  const handleConfirmMove = useCallback(
    (itemId: string, newParentId: string | null) => {
      if (!manifest) return
      void confirmMoveLibraryEntry({
        repo,
        manifest,
        itemId,
        newParentId,
        setManifest,
        setMovingId,
        loadLibrary,
        showAlert,
      })
    },
    [loadLibrary, manifest, repo, setManifest, setMovingId, showAlert],
  )

  const handleImportFile = useCallback(
    (file: File) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void importNotebookFileToTab({
        file,
        tabId: tab.id,
        dispatch,
        runtime,
        showAlert,
      })
    },
    [dispatch, runtime, showAlert],
  )

  const handleOpenExample = useCallback(
    (filename: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void loadExampleNotebookToTab({
        staticAssetPrefix,
        filename,
        tabId: tab.id,
        dispatch,
        runtime,
        showAlert,
      })
    },
    [dispatch, runtime, showAlert, staticAssetPrefix],
  )

  return {
    handleSave,
    handleOpenNotebook,
    handleNewFolder,
    handleRename,
    handleEditNotebookTags,
    handleDelete,
    handleConfirmMove,
    handleImportFile,
    handleOpenExample,
    saveDisabled: library.saveBusy || libraryLoading || !manifest,
  }
}
