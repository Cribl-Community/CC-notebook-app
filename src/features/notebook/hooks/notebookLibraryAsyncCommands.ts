import type { Dispatch, MutableRefObject } from 'react'
import { createEmptyNotebookCells, initialState } from '@features/notebook/reducer/notebookReducer'
import { parseIpynbJson, serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import {
  createNotebookWithPayload,
  deleteNotebookPayloads,
  fetchNotebookPayload,
  ipynbTextToLoadPayload,
  manifestAddFolder,
  manifestMove,
  manifestRemove,
  manifestSetNotebookTags,
  renameEntryInKv,
  saveNotebookState,
  storeManifest,
} from '@features/library'
import { exampleNotebookDisplayLabel } from '@features/examples'
import {
  assertMarkdownEmbedsWithinLimits,
  assertNotebookPersistable,
} from '@features/notebook/markdownEmbeds'
import type { NotebookRepo } from '@ports/NotebookRepo'
import type { Manifest } from '@/domain/library'
import type { NotebookWorkspaceController } from '@features/notebook/hooks/useNotebookWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'
import { closeDeletedTabs, updateOpenTabTitles } from '@features/notebook/hooks/notebookLibraryWorkspaceSync'

export async function saveCurrentTabNotebook(args: {
  repo: NotebookRepo
  tabId: string
  workspaceRef: MutableRefObject<WorkspaceState>
  manifest: Manifest
  selectedParentId: string | null
  dispatch: Dispatch<WorkspaceAction>
  setManifest: (m: Manifest) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const {
    repo,
    tabId,
    workspaceRef,
    manifest,
    selectedParentId,
    dispatch,
    setManifest,
    loadLibrary,
    showAlert,
  } = args
  const tab0 = workspaceRef.current.tabs.find((t) => t.id === tabId)
  if (!tab0 || tab0.kind === 'welcome') return
  try {
    assertNotebookPersistable(tab0.notebook)
    if (tab0.kvNotebookId) {
      const next = await saveNotebookState(repo, manifest, tab0.kvNotebookId, tab0.notebook)
      setManifest(next)
    } else {
      const result = await createNotebookWithPayload(repo, manifest, selectedParentId, tab0.notebook)
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
  }
}

export async function openNotebookFromKv(args: {
  repo: NotebookRepo
  tabId: string
  notebookId: string
  dispatch: Dispatch<WorkspaceAction>
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const { repo, tabId, notebookId, dispatch, loadLibrary, showAlert } = args
  const raw = await fetchNotebookPayload(repo, notebookId)
  if (!raw) {
    showAlert('Notebook not found in storage.')
    dispatch({ type: 'CLOSE_TAB', tabId })
    void loadLibrary()
    return
  }
  try {
    const { title, cells } = ipynbTextToLoadPayload(raw)
    const nextCells = cells.length > 0 ? cells : createEmptyNotebookCells()
    assertMarkdownEmbedsWithinLimits({ ...initialState, title, cells: nextCells })
    dispatch({
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title,
      cells: nextCells,
      kvNotebookId: notebookId,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read notebook'
    showAlert(msg)
    dispatch({ type: 'CLOSE_TAB', tabId })
  }
}

export async function createFolderInManifest(args: {
  repo: NotebookRepo
  manifest: Manifest
  parentId: string | null
  name: string
  setManifest: (m: Manifest) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const { repo, manifest, parentId, name, setManifest, loadLibrary, showAlert } = args
  const result = manifestAddFolder(manifest, name, parentId)
  if ('error' in result) {
    showAlert(result.error)
    return
  }
  try {
    await storeManifest(repo, result.manifest)
    setManifest(result.manifest)
    await loadLibrary()
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Failed to create folder')
  }
}

export async function renameLibraryEntry(args: {
  repo: NotebookRepo
  manifest: Manifest
  itemId: string
  newName: string
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatchNotebookForTab: NotebookWorkspaceController['dispatchNotebookForTab']
  setManifest: (m: Manifest) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const {
    repo,
    manifest,
    itemId,
    newName,
    workspaceRef,
    dispatchNotebookForTab,
    setManifest,
    loadLibrary,
    showAlert,
  } = args
  try {
    const result = await renameEntryInKv(repo, manifest, itemId, newName)
    if ('error' in result) {
      showAlert(result.error)
      return
    }
    setManifest(result.manifest)
    updateOpenTabTitles(workspaceRef, dispatchNotebookForTab, itemId, newName)
    await loadLibrary()
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Rename failed')
  }
}

export async function setNotebookTagsInManifest(args: {
  repo: NotebookRepo
  manifest: Manifest
  notebookId: string
  tags: string[]
  setManifest: (m: Manifest) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const { repo, manifest, notebookId, tags, setManifest, loadLibrary, showAlert } = args
  const result = manifestSetNotebookTags(manifest, notebookId, tags)
  if ('error' in result) {
    showAlert(result.error)
    return
  }
  try {
    await storeManifest(repo, result.manifest)
    setManifest(result.manifest)
    await loadLibrary()
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Failed to update tags')
  }
}

export async function deleteLibraryEntry(args: {
  repo: NotebookRepo
  manifest: Manifest
  itemId: string
  dispatch: Dispatch<WorkspaceAction>
  workspaceRef: MutableRefObject<WorkspaceState>
  setManifest: (m: Manifest) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const { repo, manifest, itemId, dispatch, workspaceRef, setManifest, loadLibrary, showAlert } =
    args
  try {
    const result = manifestRemove(manifest, itemId)
    if ('error' in result) {
      showAlert(result.error)
      return
    }
    await deleteNotebookPayloads(repo, result.notebookIdsToDelete)
    await storeManifest(repo, result.manifest)
    setManifest(result.manifest)
    closeDeletedTabs(dispatch, workspaceRef, new Set(result.notebookIdsToDelete))
    await loadLibrary()
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Delete failed')
  }
}

export async function confirmMoveLibraryEntry(args: {
  repo: NotebookRepo
  manifest: Manifest
  itemId: string
  newParentId: string | null
  setManifest: (m: Manifest) => void
  setMovingId: (id: string | null) => void
  loadLibrary: () => Promise<void>
  showAlert: (message: string) => void
}): Promise<void> {
  const { repo, manifest, itemId, newParentId, setManifest, setMovingId, loadLibrary, showAlert } =
    args
  try {
    const result = manifestMove(manifest, itemId, newParentId)
    if ('error' in result) {
      showAlert(result.error)
      return
    }
    await storeManifest(repo, result.manifest)
    setManifest(result.manifest)
    setMovingId(null)
    await loadLibrary()
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Move failed')
  }
}

export async function importNotebookFileToTab(args: {
  file: File
  tabId: string
  dispatch: Dispatch<WorkspaceAction>
  runtime: TabRuntimeController
  showAlert: (message: string) => void
}): Promise<void> {
  const { file, tabId, dispatch, runtime, showAlert } = args
  try {
    const text = await file.text()
    const { title, cells } = parseIpynbJson(text, { filename: file.name })
    const nextCells = cells.length > 0 ? cells : createEmptyNotebookCells()
    assertMarkdownEmbedsWithinLimits({ ...initialState, title, cells: nextCells })
    dispatch({
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title,
      cells: nextCells,
      kvNotebookId: null,
    })
    runtime.restartKernelForTab(tabId)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to open notebook'
    showAlert(msg)
    dispatch({ type: 'CLOSE_TAB', tabId })
  }
}

export async function loadExampleNotebookToTab(args: {
  staticAssetPrefix: string
  filename: string
  tabId: string
  dispatch: Dispatch<WorkspaceAction>
  runtime: TabRuntimeController
  showAlert: (message: string) => void
}): Promise<void> {
  const { staticAssetPrefix, filename, tabId, dispatch, runtime, showAlert } = args
  try {
    const res = await fetch(`${staticAssetPrefix}Examples/${filename}`)
    if (!res.ok) throw new Error(`Could not load example (${res.status})`)
    const text = await res.text()
    const parsed = parseIpynbJson(text, { filename })
    const title = filename.trim() ? exampleNotebookDisplayLabel(filename.trim()) : parsed.title
    const { cells } = parsed
    const nextCells = cells.length > 0 ? cells : createEmptyNotebookCells()
    assertMarkdownEmbedsWithinLimits({ ...initialState, title, cells: nextCells })
    dispatch({
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title,
      cells: nextCells,
      kvNotebookId: null,
      collapseLongCodeCellsOnOpen: true,
    })
    runtime.restartKernelForTab(tabId)
  } catch (e) {
    showAlert(e instanceof Error ? e.message : 'Failed to open example')
    dispatch({ type: 'CLOSE_TAB', tabId })
  }
}
