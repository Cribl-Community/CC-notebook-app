import { useReducer, useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { PyodideKernel } from '../pyodide/PyodideKernel'
import { createEmptyNotebookCells } from './notebookReducer'
import type { CellId, NotebookAction } from './types'
import { parseIpynbJson, serializeNotebookToIpynbJson, titleToDownloadFilename } from './ipynb'
import { Toolbar } from './Toolbar'
import { CellList } from './CellList'
import { NotebookSidebar } from './NotebookSidebar'
import { NotebookTabs } from './NotebookTabs'
import { NotebookDialog } from './NotebookDialog'
import { listMoveTargets } from './manifest'
import type { Manifest } from './manifest'
import {
  createEmptyTab,
  createInitialWorkspace,
  tabIsDirty,
  tabWorkspaceReducer,
} from './tabWorkspace'
import {
  createNotebookWithPayload,
  deleteNotebookPayloads,
  fetchManifest,
  fetchNotebookPayload,
  ipynbTextToLoadPayload,
  manifestAddFolder,
  manifestMove,
  manifestRemove,
  renameEntryInKv,
  saveNotebookState,
  storeManifest,
} from './notebookLibrary'
import {
  buildCriblSearchDataframeCode,
  encodeRowsJsonForPythonBase64,
  parseCriblSearchMagic,
} from './criblSearchMagic'
import { runCriblSearchJob } from '../cribl/searchJobs'

type DialogState =
  | { kind: 'alert'; message: string }
  | { kind: 'confirm'; message: string }
  | { kind: 'prompt'; title: string; label: string; defaultValue: string; input: string }

function readStoredNotebookTitle(): string | undefined {
  try {
    const t = localStorage.getItem('nb-notebook-title')
    if (t?.trim()) return t.trim()
  } catch {
    // localStorage unavailable
  }
  return undefined
}

export function NotebookPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('nb-theme') as 'dark' | 'light') ?? 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('nb-theme', theme)
    } catch {
      // localStorage unavailable in sandboxed iframe — theme resets on reload
    }
  }, [theme])

  const [workspace, dispatch] = useReducer(
    tabWorkspaceReducer,
    undefined,
    () => createInitialWorkspace(readStoredNotebookTitle()),
  )

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const confirmRef = useRef<((ok: boolean) => void) | null>(null)
  const promptRef = useRef<((value: string | null) => void) | null>(null)

  const showAlert = useCallback((message: string) => {
    setDialog({ kind: 'alert', message })
  }, [])

  const showConfirm = useCallback((message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      confirmRef.current = (ok: boolean) => {
        confirmRef.current = null
        resolve(ok)
      }
      setDialog({ kind: 'confirm', message })
    })
  }, [])

  const showPrompt = useCallback(
    (title: string, label: string, defaultValue: string): Promise<string | null> => {
      return new Promise((resolve) => {
        promptRef.current = (value: string | null) => {
          promptRef.current = null
          resolve(value)
        }
        setDialog({ kind: 'prompt', title, label, defaultValue, input: defaultValue })
      })
    },
    [],
  )

  const dismissAlert = useCallback(() => setDialog(null), [])

  const dialogConfirmOk = useCallback(() => {
    confirmRef.current?.(true)
    setDialog(null)
  }, [])

  const dialogConfirmCancel = useCallback(() => {
    confirmRef.current?.(false)
    setDialog(null)
  }, [])

  const dialogPromptSubmit = useCallback(() => {
    setDialog((d) => {
      if (d?.kind !== 'prompt') return d
      const fn = promptRef.current
      if (fn) {
        promptRef.current = null
        fn(d.input)
      }
      return null
    })
  }, [])

  const dialogPromptCancel = useCallback(() => {
    promptRef.current?.(null)
    setDialog(null)
  }, [])

  const dialogPromptChange = useCallback((input: string) => {
    setDialog((d) => (d?.kind === 'prompt' ? { ...d, input } : d))
  }, [])

  const kernelsRef = useRef<Map<string, PyodideKernel>>(new Map())
  const tabGensRef = useRef<Map<string, number>>(new Map())
  const tabQueuesRef = useRef<Map<string, { p: Promise<void> }>>(new Map())
  const tabExecCountersRef = useRef<Map<string, number>>(new Map())

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

  const state = activeTab?.notebook

  const dirty = activeTab ? tabIsDirty(activeTab) : false

  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true)
    setLibraryError(null)
    try {
      const m = await fetchManifest()
      setManifest(m)
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : 'Failed to load notebooks')
    } finally {
      setLibraryLoading(false)
    }
  }, [])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void loadLibrary()
    }, 0)
    return () => clearTimeout(id)
  }, [loadLibrary])

  useEffect(() => {
    try {
      if (activeTab) localStorage.setItem('nb-notebook-title', activeTab.notebook.title)
    } catch {
      // ignore
    }
  }, [activeTab])

  const moveDestinations = useMemo(
    () => (movingId ? listMoveTargets(manifest?.items ?? [], movingId) : []),
    [manifest, movingId],
  )

  const getRunQueue = useCallback((tabId: string) => {
    const m = tabQueuesRef.current
    if (!m.has(tabId)) m.set(tabId, { p: Promise.resolve() })
    return m.get(tabId)!
  }, [])

  const initKernelForTab = useCallback((tabId: string) => {
    const gen = (tabGensRef.current.get(tabId) ?? 0) + 1
    tabGensRef.current.set(tabId, gen)
    dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'loading' } })
    const kernel = new PyodideKernel()
    kernelsRef.current.set(tabId, kernel)
    kernel.ready
      .then(() => {
        if (tabGensRef.current.get(tabId) === gen) {
          dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'ready' } })
        }
      })
      .catch(() => {
        if (tabGensRef.current.get(tabId) === gen) {
          dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'error' } })
        }
      })
  }, [])

  const restartKernelForTab = useCallback(
    (tabId: string) => {
      kernelsRef.current.get(tabId)?.dispose()
      kernelsRef.current.delete(tabId)
      const q = tabQueuesRef.current.get(tabId)
      if (q) q.p = Promise.resolve()
      tabExecCountersRef.current.set(tabId, 0)
      dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'RESTART' } })
      initKernelForTab(tabId)
    },
    [initKernelForTab],
  )

  const tabIdsKey = workspace.tabs.map((t) => t.id).join(',')

  useEffect(() => {
    const tabs = workspaceRef.current.tabs
    const ids = new Set(tabs.map((t) => t.id))
    for (const [id, k] of [...kernelsRef.current.entries()]) {
      if (!ids.has(id)) {
        k.dispose()
        kernelsRef.current.delete(id)
        tabGensRef.current.delete(id)
        tabQueuesRef.current.delete(id)
        tabExecCountersRef.current.delete(id)
      }
    }
    for (const tab of tabs) {
      if (!kernelsRef.current.has(tab.id)) {
        initKernelForTab(tab.id)
      }
    }
  }, [tabIdsKey, initKernelForTab])

  const dispatchNotebook = useCallback((action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId: activeTabIdRef.current, action })
  }, [])

  const dispatchNotebookForTab = useCallback((tabId: string, action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId, action })
  }, [])

  const runCell = useCallback(
    (id: CellId) => {
      const tid = activeTabIdRef.current
      const kernel = kernelsRef.current.get(tid)
      if (!kernel) return

      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab) return
      const cell = tab.notebook.cells.find((c) => c.id === id)
      if (!cell) return
      const source = cell.source
      const myGen = tabGensRef.current.get(tid) ?? 0

      const q = getRunQueue(tid)
      q.p = q.p.then(async () => {
        if (tabGensRef.current.get(tid) !== myGen) return

        dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_RUNNING', id } })

        try {
          await kernel.ready
          if (tabGensRef.current.get(tid) !== myGen) return

          dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_KERNEL_STATUS', status: 'busy' } })
          const prevCount = tabExecCountersRef.current.get(tid) ?? 0
          const count = prevCount + 1
          tabExecCountersRef.current.set(tid, count)

          const appendStream = (name: 'stdout' | 'stderr', text: string) => {
            if (tabGensRef.current.get(tid) === myGen) {
              dispatch({
                type: 'TAB_NOTEBOOK',
                tabId: tid,
                action: { type: 'APPEND_OUTPUT', id, output: { output_type: 'stream', name, text } },
              })
            }
          }

          const magic = parseCriblSearchMagic(source)
          if (magic.kind === 'error') {
            appendStream('stderr', `${magic.message}\n`)
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
            return
          }

          if (magic.kind === 'cribl_search') {
            const { varName, preview, query } = magic.value
            try {
              const rows = await runCriblSearchJob({
                query,
                onProgress: (line) => appendStream('stdout', `${line}\n`),
              })
              if (tabGensRef.current.get(tid) !== myGen) return

              const b64 = encodeRowsJsonForPythonBase64(rows)
              const code = buildCriblSearchDataframeCode(varName, b64, preview)
              const result = await kernel.execute(code, (name, text) => {
                if (tabGensRef.current.get(tid) === myGen) {
                  dispatch({
                    type: 'TAB_NOTEBOOK',
                    tabId: tid,
                    action: { type: 'APPEND_OUTPUT', id, output: { output_type: 'stream', name, text } },
                  })
                }
              })

              if (tabGensRef.current.get(tid) !== myGen) return

              for (const output of result.outputs) {
                if (output.output_type !== 'stream') {
                  dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'APPEND_OUTPUT', id, output } })
                }
              }

              const hasError = result.outputs.some((o) => o.output_type === 'error')
              if (hasError) {
                dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
              } else {
                dispatch({
                  type: 'TAB_NOTEBOOK',
                  tabId: tid,
                  action: { type: 'FINISH_CELL', id, execution_count: count },
                })
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              appendStream('stderr', `${msg}\n`)
              dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
            }
            return
          }

          const result = await kernel.execute(source, (name, text) => {
            if (tabGensRef.current.get(tid) === myGen) {
              dispatch({
                type: 'TAB_NOTEBOOK',
                tabId: tid,
                action: { type: 'APPEND_OUTPUT', id, output: { output_type: 'stream', name, text } },
              })
            }
          })

          if (tabGensRef.current.get(tid) !== myGen) return

          for (const output of result.outputs) {
            if (output.output_type !== 'stream') {
              dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'APPEND_OUTPUT', id, output } })
            }
          }

          const hasError = result.outputs.some((o) => o.output_type === 'error')
          if (hasError) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
          } else {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'FINISH_CELL', id, execution_count: count } })
          }
        } catch {
          if (tabGensRef.current.get(tid) === myGen) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
          }
        } finally {
          if (tabGensRef.current.get(tid) === myGen) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_KERNEL_STATUS', status: 'ready' } })
          }
        }
      })
    },
    [getRunQueue],
  )

  const runAll = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (!tab) return
    tab.notebook.cells
      .filter((c) => c.cell_type === 'code')
      .forEach((cell) => runCell(cell.id))
  }, [runCell])

  const restartKernel = useCallback(() => {
    const tid = activeTabIdRef.current
    restartKernelForTab(tid)
  }, [restartKernelForTab])

  const handleDownload = useCallback(() => {
    if (!state) return
    const json = serializeNotebookToIpynbJson(state)
    const blob = new Blob([json], { type: 'application/x-ipynb+json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = titleToDownloadFilename(state.title)
    a.rel = 'noopener'
    a.click()
    URL.revokeObjectURL(url)
  }, [state])

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
    if (!manifest) {
      void loadLibrary()
      return
    }
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
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
          restartKernelForTab(tab.id)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to open notebook'
          showAlert(msg)
        }
      })()
    },
    [restartKernelForTab, showAlert],
  )

  const tabLabels = useMemo(
    () =>
      workspace.tabs.map((t) => ({
        id: t.id,
        title: t.notebook.title,
        dirty: tabIsDirty(t),
      })),
    [workspace.tabs],
  )

  const dialogProps =
    dialog?.kind === 'prompt'
      ? {
          variant: 'prompt' as const,
          title: dialog.title,
          message: '',
          promptLabel: dialog.label,
          promptValue: dialog.input,
        }
      : dialog?.kind === 'confirm'
        ? {
            variant: 'confirm' as const,
            message: dialog.message,
          }
        : {
            variant: 'alert' as const,
            message: dialog?.message ?? '',
          }

  const handleDialogPrimary = () => {
    if (!dialog) return
    if (dialog.kind === 'alert') dismissAlert()
    else if (dialog.kind === 'confirm') dialogConfirmOk()
    else dialogPromptSubmit()
  }

  const handleDialogSecondary = () => {
    if (!dialog) return
    if (dialog.kind === 'confirm') dialogConfirmCancel()
    else if (dialog.kind === 'prompt') dialogPromptCancel()
  }

  const ready = Boolean(state && activeTab)

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
                    onRestart={restartKernel}
                    theme={theme}
                    onThemeChange={setTheme}
                  />
                </div>
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
                      onRun={runCell}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
            </>
          )}
        </div>
      </div>
      <NotebookDialog
        open={dialog !== null}
        variant={dialogProps.variant}
        title={'title' in dialogProps ? dialogProps.title : undefined}
        message={'message' in dialogProps ? dialogProps.message : ''}
        promptLabel={'promptLabel' in dialogProps ? dialogProps.promptLabel : undefined}
        promptValue={dialog?.kind === 'prompt' ? dialog.input : ''}
        onPromptValueChange={dialogPromptChange}
        onPrimary={handleDialogPrimary}
        onSecondary={dialog?.kind === 'alert' ? undefined : handleDialogSecondary}
      />
    </>
  )
}
