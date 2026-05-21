import { useCallback } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { createEmptyNotebookCells } from '@features/notebook/reducer/notebookReducer'
import { parseIpynbJson } from '@features/notebook/codec/ipynb'
import { createEmptyTab, type WorkspaceAction, type WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import {
  createNotebookWithPayload,
  deleteNotebookPayloads,
  fetchNotebookPayload,
  ipynbTextToLoadPayload,
  manifestAddFolder,
  manifestMove,
  manifestRemove,
  renameEntryInKv,
  saveNotebookState,
  storeManifest,
} from '@features/library/notebookLibrary'
import { exampleNotebookDisplayLabel } from '@features/examples/examplesManifest'
import { useEnv } from '@app/providers'
import { serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'
import type { NotebookWorkspaceController } from '@features/notebook/hooks/useNotebookWorkspace'
import type { NotebookLibraryController } from '@features/library/hooks/useNotebookLibrary'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'

export interface NotebookLibraryActionsArgs {
  workspace: NotebookWorkspaceController
  runtime: TabRuntimeController
  library: NotebookLibraryController
  showAlert: (message: string) => void
  showConfirm: (message: string) => Promise<boolean>
  showPrompt: (title: string, label: string, defaultValue?: string) => Promise<string | null>
}

function updateOpenTabTitles(
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

function closeDeletedTabs(
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

export function useNotebookLibraryActions(args: NotebookLibraryActionsArgs) {
  const { workspace, runtime, library, showAlert, showConfirm, showPrompt } = args
  const { staticAssetPrefix } = useEnv()
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
        if (tab0.kvNotebookId) {
          const next = await saveNotebookState(manifest, tab0.kvNotebookId, tab0.notebook)
          setManifest(next)
        } else {
          const result = await createNotebookWithPayload(manifest, selectedParentId, tab0.notebook)
          if ('error' in result) {
            showAlert(result.error)
            return
          }
          setManifest(result.manifest)
          dispatch({
            type: 'SET_TAB_META',
            tabId,
            kvNotebookId: result.id,
          })
        }
        const updatedTab = workspaceRef.current.tabs.find((x) => x.id === tabId)
        if (updatedTab) {
          dispatch({
            type: 'SET_TAB_META',
            tabId,
            lastSavedJson: serializeNotebookToIpynbJson(updatedTab.notebook),
          })
        }
        await loadLibrary()
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaveBusy(false)
      }
    })()
  }, [activeTabIdRef, dispatch, loadLibrary, manifest, selectedParentId, setManifest, setSaveBusy, showAlert, workspaceRef])

  const handleOpenNotebook = useCallback(
    (id: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void (async () => {
        const raw = await fetchNotebookPayload(id)
        if (!raw) {
          showAlert('Notebook not found in storage.')
          void loadLibrary()
          return
        }
        try {
          const { title, cells } = ipynbTextToLoadPayload(raw)
          dispatch({
            type: 'REPLACE_TAB_CONTENT',
            tabId: tab.id,
            title,
            cells: cells.length > 0 ? cells : createEmptyNotebookCells(),
            kvNotebookId: id,
          })
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to read notebook'
          showAlert(msg)
        }
      })()
    },
    [dispatch, loadLibrary, showAlert],
  )

  const handleNewFolder = useCallback(
    (parentId: string | null) => {
      if (!manifest) return
      void (async () => {
        const name = await showPrompt('New folder', 'Folder name', '')
        if (name === null) return
        const result = manifestAddFolder(manifest, name, parentId)
        if ('error' in result) {
          showAlert(result.error)
          return
        }
        try {
          await storeManifest(result.manifest)
          setManifest(result.manifest)
          await loadLibrary()
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Failed to create folder')
        }
      })()
    },
    [loadLibrary, manifest, setManifest, showAlert, showPrompt],
  )

  const handleRename = useCallback(
    (id: string, currentName: string) => {
      if (!manifest) return
      void (async () => {
        const name = await showPrompt('Rename', 'New name', currentName)
        if (name === null) return
        try {
          const result = await renameEntryInKv(manifest, id, name)
          if ('error' in result) {
            showAlert(result.error)
            return
          }
          setManifest(result.manifest)
          updateOpenTabTitles(workspaceRef, dispatchNotebookForTab, id, name)
          await loadLibrary()
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Rename failed')
        }
      })()
    },
    [dispatchNotebookForTab, loadLibrary, manifest, setManifest, showAlert, showPrompt, workspaceRef],
  )

  const handleDelete = useCallback(
    (id: string, name: string, kind: 'folder' | 'notebook') => {
      if (!manifest) return
      const label = kind === 'folder' ? `folder “${name}” and everything inside it` : `“${name}”`
      void showConfirm(`Delete ${label}? This cannot be undone.`).then((ok) => {
        if (!ok) return
        void (async () => {
          try {
            const result = manifestRemove(manifest, id)
            if ('error' in result) {
              showAlert(result.error)
              return
            }
            await deleteNotebookPayloads(result.notebookIdsToDelete)
            await storeManifest(result.manifest)
            setManifest(result.manifest)
            closeDeletedTabs(dispatch, workspaceRef, new Set(result.notebookIdsToDelete))
            await loadLibrary()
          } catch (e) {
            showAlert(e instanceof Error ? e.message : 'Delete failed')
          }
        })()
      })
    },
    [dispatch, loadLibrary, manifest, setManifest, showAlert, showConfirm, workspaceRef],
  )

  const handleConfirmMove = useCallback(
    (itemId: string, newParentId: string | null) => {
      if (!manifest) return
      void (async () => {
        try {
          const result = manifestMove(manifest, itemId, newParentId)
          if ('error' in result) {
            showAlert(result.error)
            return
          }
          await storeManifest(result.manifest)
          setManifest(result.manifest)
          setMovingId(null)
          await loadLibrary()
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Move failed')
        }
      })()
    },
    [loadLibrary, manifest, setManifest, setMovingId, showAlert],
  )

  const handleImportFile = useCallback(
    (file: File) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void (async () => {
        try {
          const text = await file.text()
          const { title, cells } = parseIpynbJson(text, { filename: file.name })
          dispatch({
            type: 'REPLACE_TAB_CONTENT',
            tabId: tab.id,
            title,
            cells: cells.length > 0 ? cells : createEmptyNotebookCells(),
            kvNotebookId: null,
          })
          runtime.restartKernelForTab(tab.id)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to open notebook'
          showAlert(msg)
        }
      })()
    },
    [dispatch, runtime, showAlert],
  )

  const handleOpenExample = useCallback(
    (filename: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void (async () => {
        try {
          const res = await fetch(`${staticAssetPrefix}Examples/${filename}`)
          if (!res.ok) throw new Error(`Could not load example (${res.status})`)
          const text = await res.text()
          const parsed = parseIpynbJson(text, { filename })
          const title = filename.trim() ? exampleNotebookDisplayLabel(filename.trim()) : parsed.title
          const { cells } = parsed
          dispatch({
            type: 'REPLACE_TAB_CONTENT',
            tabId: tab.id,
            title,
            cells: cells.length > 0 ? cells : createEmptyNotebookCells(),
            kvNotebookId: null,
            collapseLongCodeCellsOnOpen: true,
          })
          runtime.restartKernelForTab(tab.id)
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Failed to open example')
        }
      })()
    },
    [dispatch, runtime, showAlert, staticAssetPrefix],
  )

  return {
    handleSave,
    handleOpenNotebook,
    handleNewFolder,
    handleRename,
    handleDelete,
    handleConfirmMove,
    handleImportFile,
    handleOpenExample,
    saveDisabled: library.saveBusy || libraryLoading || !manifest,
  }
}
