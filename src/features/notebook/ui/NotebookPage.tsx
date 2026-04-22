import { useCallback, useEffect, useState, useMemo } from 'react'
import type { CompletionItem } from '@platform/pyodide/types'
import { createEmptyNotebookCells } from '@features/notebook/reducer/notebookReducer'
import type { CellId } from '@features/notebook/model/types'
import { parseIpynbJson, serializeNotebookToIpynbJson, titleToDownloadFilename } from '@features/notebook/codec/ipynb'
import { Toolbar } from '@features/notebook/ui/Toolbar'
import { CellList } from '@features/notebook/ui/CellList'
import { NotebookSidebar } from '@features/library/ui/NotebookSidebar'
import { NotebookTabs } from '@features/notebook/ui/NotebookTabs'
import { useNotebookLibrary } from '@features/library/hooks/useNotebookLibrary'
import { createEmptyTab, tabIsDirty } from '@features/notebook/reducer/tabWorkspace'
import { useNotebookWorkspace } from '@features/notebook/hooks/useNotebookWorkspace'
import { exampleNotebookDisplayLabel } from '@features/examples/examplesManifest'
import { WelcomePage } from '@features/welcome/WelcomePage'
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
import { formatGeneratedPythonSource } from '@features/ai-riptide/riptideService'
import { useAiCodeService, useDialogs, useTheme } from '@app/providers'
import { useTabNotebookRuntime } from '@features/notebook/hooks/useTabNotebookRuntime'
import { useCellRunner } from '@features/notebook/hooks/useCellRunner'
import { notebookStaticPrefix } from '@platform/staticAssets'

export function NotebookPage() {
  const { appStyle, setAppStyle, codeMirrorLuma } = useTheme()
  const { alert: showAlert, confirm: showConfirm, prompt: showPrompt } = useDialogs()

  const {
    workspace,
    dispatch,
    workspaceRef,
    activeTabIdRef,
    activeTab,
    tabIdsKey,
    dirty,
    dispatchNotebook,
    dispatchNotebookForTab,
  } = useNotebookWorkspace()

  const library = useNotebookLibrary()
  const {
    manifest,
    setManifest,
    loading: libraryLoading,
    error: libraryError,
    selectedParentId,
    setSelectedParentId,
    movingId,
    setMovingId,
    saveBusy,
    setSaveBusy,
    moveDestinations,
    reload: loadLibrary,
  } = library
  const [aiCodeBusyCellId, setAiCodeBusyCellId] = useState<CellId | null>(null)

  const state = activeTab?.notebook

  useEffect(() => {
    try {
      if (activeTab && activeTab.kind === 'notebook') {
        localStorage.setItem('nb-notebook-title', activeTab.notebook.title)
      }
    } catch {
      // ignore
    }
  }, [activeTab])

  const runtime = useTabNotebookRuntime(dispatch, workspaceRef, tabIdsKey)

  const completeCode = useCallback(
    async (code: string, cursor: number): Promise<CompletionItem[] | null> => {
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return null
      const kernel = runtime.kernelFor(tid)
      if (!kernel) return null
      const ks = tab.notebook.kernelStatus
      if (ks === 'loading' || ks === 'error') return null
      try {
        await kernel.ready
      } catch {
        return null
      }
      return kernel.complete(code, cursor)
    },
    [],
  )

  const aiCode = useAiCodeService()

  const handleAiGenerateFromPrompt = useCallback(
    async (cellId: CellId, prompt: string) => {
      if (!aiCode.isAvailable()) {
        showAlert(
          'Riptide code generation requires the app to run inside Cribl with AI APIs enabled. Local development mode has no API base URL.',
        )
        return
      }
      const trimmed = prompt.trim()
      if (!trimmed) return
      setAiCodeBusyCellId(cellId)
      try {
        const code = await aiCode.generatePythonFromPrompt(trimmed)
        const source = formatGeneratedPythonSource(trimmed, code)
        dispatchNotebook({ type: 'UPDATE_SOURCE', id: cellId, source })
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Riptide request failed.')
      } finally {
        setAiCodeBusyCellId(null)
      }
    },
    [aiCode, showAlert, dispatchNotebook],
  )

  const { runCellAndAdvance, runAll, restartKernel, stopExecution, canStopExecution } =
    useCellRunner({ runtime, workspaceRef, activeTabIdRef, dispatch, activeTab, state })

  const handleDownload = useCallback(() => {
    if (!state || activeTab?.kind === 'welcome') return
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
    [showConfirm],
  )

  const handleNewTab = useCallback(() => {
    dispatch({ type: 'ADD_TAB' })
  }, [])

  const handleSelectTab = useCallback((tabId: string) => {
    dispatch({ type: 'SELECT_TAB', tabId })
  }, [])

  const handleSave = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab0 = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (tab0?.kind === 'welcome') return
    if (!manifest) {
      void loadLibrary()
      return
    }
    const tab = tab0
    if (!tab) return

    void (async () => {
      setSaveBusy(true)
      try {
        if (tab.kvNotebookId) {
          const next = await saveNotebookState(manifest, tab.kvNotebookId, tab.notebook)
          setManifest(next)
        } else {
          const result = await createNotebookWithPayload(manifest, selectedParentId, tab.notebook)
          if ('error' in result) {
            showAlert(result.error)
            return
          }
          setManifest(result.manifest)
          dispatch({
            type: 'SET_TAB_META',
            tabId: tid,
            kvNotebookId: result.id,
          })
        }
        const t2 = workspaceRef.current.tabs.find((x) => x.id === tid)
        if (t2) {
          dispatch({
            type: 'SET_TAB_META',
            tabId: tid,
            lastSavedJson: serializeNotebookToIpynbJson(t2.notebook),
          })
        }
        await loadLibrary()
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaveBusy(false)
      }
    })()
  }, [loadLibrary, manifest, selectedParentId, showAlert])

  const handleNewNotebook = useCallback(() => {
    dispatch({ type: 'ADD_TAB' })
  }, [])

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
    [loadLibrary, showAlert],
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
    [loadLibrary, manifest, showAlert, showPrompt],
  )

  const handleRename = useCallback(
    (id: string, currentName: string) => {
      if (!manifest) return
      void (async () => {
        const name = await showPrompt('Rename', 'New name', currentName)
        if (name === null) return
        try {
          const r = await renameEntryInKv(manifest, id, name)
          if ('error' in r) {
            showAlert(r.error)
            return
          }
          setManifest(r.manifest)
          for (const t of workspaceRef.current.tabs) {
            if (t.kvNotebookId === id) {
              dispatchNotebookForTab(t.id, { type: 'SET_NOTEBOOK_TITLE', title: name })
            }
          }
          await loadLibrary()
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Rename failed')
        }
      })()
    },
    [dispatchNotebookForTab, loadLibrary, manifest, showAlert, showPrompt],
  )

  const handleDelete = useCallback(
    (id: string, name: string, kind: 'folder' | 'notebook') => {
      if (!manifest) return
      const label = kind === 'folder' ? `folder “${name}” and everything inside it` : `“${name}”`
      void showConfirm(`Delete ${label}? This cannot be undone.`).then((ok) => {
        if (!ok) return
        const m = manifest
        if (!m) return
        void (async () => {
          try {
            const r = manifestRemove(m, id)
            if ('error' in r) {
              showAlert(r.error)
              return
            }
            await deleteNotebookPayloads(r.notebookIdsToDelete)
            await storeManifest(r.manifest)
            setManifest(r.manifest)
            const deletedNotebookIds = new Set(r.notebookIdsToDelete)
            for (const t of [...workspaceRef.current.tabs]) {
              if (t.kvNotebookId && deletedNotebookIds.has(t.kvNotebookId)) {
                dispatch({ type: 'CLOSE_TAB', tabId: t.id })
              }
            }
            await loadLibrary()
          } catch (e) {
            showAlert(e instanceof Error ? e.message : 'Delete failed')
          }
        })()
      })
    },
    [loadLibrary, manifest, showAlert, showConfirm],
  )

  const handleConfirmMove = useCallback(
    (itemId: string, newParentId: string | null) => {
      if (!manifest) return
      void (async () => {
        try {
          const r = manifestMove(manifest, itemId, newParentId)
          if ('error' in r) {
            showAlert(r.error)
            return
          }
          await storeManifest(r.manifest)
          setManifest(r.manifest)
          setMovingId(null)
          await loadLibrary()
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Move failed')
        }
      })()
    },
    [loadLibrary, manifest, showAlert],
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
    [runtime, showAlert],
  )

  const handleOpenExample = useCallback(
    (filename: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void (async () => {
        try {
          const res = await fetch(`${notebookStaticPrefix()}Examples/${filename}`)
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
          })
          runtime.restartKernelForTab(tab.id)
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Failed to open example')
        }
      })()
    },
    [runtime, showAlert],
  )

  const tabLabels = useMemo(
    () =>
      workspace.tabs.map((t) => ({
        id: t.id,
        title: t.kind === 'welcome' ? 'Welcome' : t.notebook.title,
        dirty: tabIsDirty(t),
      })),
    [workspace.tabs],
  )

  const ready = Boolean(state && activeTab)
  const isWelcome = activeTab?.kind === 'welcome'

  return (
    <>
      <div className="nb-app-frame">
        <div className="nb-page">
          {!ready ? (
            <div className="nb-loading">Loading…</div>
          ) : (
            <>
              <NotebookSidebar
                items={manifest?.items ?? []}
                loading={libraryLoading}
                error={libraryError}
                selectedNotebookId={activeTab.kvNotebookId}
                selectedParentId={selectedParentId}
                movingId={movingId}
                onRefresh={() => void loadLibrary()}
                onSelectParent={setSelectedParentId}
                onOpenNotebook={handleOpenNotebook}
                onNewNotebook={handleNewNotebook}
                onNewFolder={handleNewFolder}
                onRename={handleRename}
                onStartMove={setMovingId}
                onCancelMove={() => setMovingId(null)}
                onConfirmMove={handleConfirmMove}
                onDelete={handleDelete}
                moveDestinations={moveDestinations}
              />
          <div className="nb-workspace">
            <div className="nb-workspace-stack">
              <NotebookTabs
                tabs={tabLabels}
                activeTabId={workspace.activeTabId}
                onSelectTab={handleSelectTab}
                onCloseTab={handleCloseTab}
                onNewTab={handleNewTab}
              />
              <div className="nb-editor-shell">
                <div className="nb-toolbar-rail">
                  <Toolbar
                    variant={isWelcome ? 'welcome' : 'notebook'}
                    kernelStatus={state.kernelStatus}
                    title={state.title}
                    onTitleChange={(t) => dispatchNotebook({ type: 'SET_NOTEBOOK_TITLE', title: t })}
                    onDownload={handleDownload}
                    onImportFile={handleImportFile}
                    onSave={handleSave}
                    saveDisabled={saveBusy || libraryLoading || !manifest}
                    dirty={dirty}
                    onAddCodeCell={() => dispatchNotebook({ type: 'ADD_CELL', cellType: 'code' })}
                    onAddMarkdownCell={() => dispatchNotebook({ type: 'ADD_CELL', cellType: 'markdown' })}
                    onRunAll={runAll}
                    onClearAllOutputs={() => dispatchNotebook({ type: 'CLEAR_ALL_OUTPUTS' })}
                    onStop={stopExecution}
                    stopEnabled={canStopExecution}
                    onRestart={restartKernel}
                    appStyle={appStyle}
                    onAppStyleChange={setAppStyle}
                  />
                </div>
                {isWelcome ? (
                  <div className="nb-main">
                    <div className="nb-scroll">
                      <WelcomePage onOpenExample={handleOpenExample} onNewNotebook={handleNewTab} />
                    </div>
                  </div>
                ) : (
                  <>
                    {state.kernelStatus === 'loading' && (
                      <div className="nb-loading">Loading Python kernel…</div>
                    )}
                    {state.kernelStatus === 'error' && (
                      <div className="nb-loading nb-loading--error">
                        Kernel failed to load. Check console for details.
                      </div>
                    )}
                    <div className="nb-main">
                      <div className="nb-scroll">
                        <CellList
                          cells={state.cells}
                          selectedId={state.selectedId}
                          dispatch={dispatchNotebook}
                          onRunAndAdvance={runCellAndAdvance}
                          codeMirrorLuma={codeMirrorLuma}
                          completeCode={completeCode}
                          onAiGenerateFromPrompt={handleAiGenerateFromPrompt}
                          aiCodeBusyCellId={aiCodeBusyCellId}
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
