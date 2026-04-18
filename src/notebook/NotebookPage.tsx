import { useReducer, useRef, useCallback, useEffect, useState, useMemo } from 'react'
import { PyodideKernel } from '../pyodide/PyodideKernel'
import { notebookReducer, initialState, createEmptyNotebookCells } from './notebookReducer'
import type { CellId, NotebookState } from './types'
import { parseIpynbJson, serializeNotebookToIpynbJson, titleToDownloadFilename } from './ipynb'
import { Toolbar } from './Toolbar'
import { CellList } from './CellList'
import { NotebookSidebar } from './NotebookSidebar'
import { listMoveTargets } from './manifest'
import type { Manifest } from './manifest'
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

function readStoredNotebookTitle(): string {
  try {
    const t = localStorage.getItem('nb-notebook-title')
    if (t?.trim()) return t.trim()
  } catch {
    // localStorage unavailable
  }
  return initialState.title
}

function buildInitialNotebookState(): NotebookState {
  return { ...initialState, title: readStoredNotebookTitle() }
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

  const [state, dispatch] = useReducer(notebookReducer, undefined, buildInitialNotebookState)
  const [lastSavedJson, setLastSavedJson] = useState(() =>
    serializeNotebookToIpynbJson(buildInitialNotebookState()),
  )

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [activeNotebookId, setActiveNotebookId] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)

  const kernelRef = useRef<PyodideKernel | null>(null)
  const runQueueRef = useRef<Promise<void>>(Promise.resolve())
  const execCounterRef = useRef(0)
  const genRef = useRef(0)

  const stateRef = useRef<NotebookState>(state)
  useEffect(() => {
    stateRef.current = state
  })

  const currentJson = useMemo(() => serializeNotebookToIpynbJson(state), [state])
  const dirty = currentJson !== lastSavedJson

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
      localStorage.setItem('nb-notebook-title', state.title)
    } catch {
      // ignore
    }
  }, [state.title])

  const moveDestinations = useMemo(
    () => (movingId ? listMoveTargets(manifest?.items ?? [], movingId) : []),
    [manifest, movingId],
  )

  const initKernel = useCallback(() => {
    const myGen = ++genRef.current
    dispatch({ type: 'SET_KERNEL_STATUS', status: 'loading' })
    const kernel = new PyodideKernel()
    kernelRef.current = kernel
    kernel.ready
      .then(() => {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'ready' })
      })
      .catch(() => {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'error' })
      })
  }, [dispatch])

  useEffect(() => {
    initKernel()
    return () => {
      kernelRef.current?.dispose()
    }
  }, [initKernel])

  const runCell = useCallback((id: CellId) => {
    const kernel = kernelRef.current
    if (!kernel) return

    const cell = stateRef.current.cells.find((c) => c.id === id)
    if (!cell) return
    const source = cell.source
    const myGen = genRef.current

    runQueueRef.current = runQueueRef.current.then(async () => {
      if (genRef.current !== myGen) return

      dispatch({ type: 'SET_RUNNING', id })

      try {
        await kernel.ready
        if (genRef.current !== myGen) return

        dispatch({ type: 'SET_KERNEL_STATUS', status: 'busy' })
        const count = ++execCounterRef.current

        const result = await kernel.execute(source, (name, text) => {
          if (genRef.current === myGen) {
            dispatch({ type: 'APPEND_OUTPUT', id, output: { output_type: 'stream', name, text } })
          }
        })

        if (genRef.current !== myGen) return

        for (const output of result.outputs) {
          if (output.output_type !== 'stream') {
            dispatch({ type: 'APPEND_OUTPUT', id, output })
          }
        }

        const hasError = result.outputs.some((o) => o.output_type === 'error')
        if (hasError) {
          dispatch({ type: 'ERROR_CELL', id })
        } else {
          dispatch({ type: 'FINISH_CELL', id, execution_count: count })
        }
      } catch {
        if (genRef.current === myGen) dispatch({ type: 'ERROR_CELL', id })
      } finally {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'ready' })
      }
    })
  }, [dispatch])

  const runAll = useCallback(() => {
    stateRef.current.cells
      .filter((c) => c.cell_type === 'code')
      .forEach((cell) => runCell(cell.id))
  }, [runCell])

  const restartKernel = useCallback(() => {
    kernelRef.current?.dispose()
    kernelRef.current = null
    runQueueRef.current = Promise.resolve()
    execCounterRef.current = 0
    dispatch({ type: 'RESTART' })
    initKernel()
  }, [dispatch, initKernel])

  const handleDownload = useCallback(() => {
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

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true
    return window.confirm('Discard unsaved changes?')
  }, [dirty])

  const resetToFreshNotebook = useCallback(() => {
    const cells = createEmptyNotebookCells()
    const prev = stateRef.current
    dispatch({ type: 'LOAD_NOTEBOOK', title: 'Untitled', cells })
    setActiveNotebookId(null)
    setLastSavedJson(
      serializeNotebookToIpynbJson({
        ...prev,
        title: 'Untitled',
        cells,
        selectedId: cells[0]?.id ?? null,
        executionCounter: 0,
      }),
    )
  }, [dispatch])

  const handleNewNotebook = useCallback(() => {
    if (!confirmDiscard()) return
    resetToFreshNotebook()
  }, [confirmDiscard, resetToFreshNotebook])

  const handleOpenNotebook = useCallback(
    (id: string) => {
      if (!confirmDiscard()) return
      void (async () => {
        const raw = await fetchNotebookPayload(id)
        if (!raw) {
          window.alert('Notebook not found in storage.')
          void loadLibrary()
          return
        }
        try {
          const { title, cells } = ipynbTextToLoadPayload(raw)
          const prev = stateRef.current
          dispatch({ type: 'LOAD_NOTEBOOK', title, cells })
          setActiveNotebookId(id)
          setLastSavedJson(
            serializeNotebookToIpynbJson({
              ...prev,
              title,
              cells,
              selectedId: cells[0]?.id ?? null,
              executionCounter: 0,
            }),
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to read notebook'
          window.alert(msg)
        }
      })()
    },
    [confirmDiscard, dispatch, loadLibrary],
  )

  const handleSave = useCallback(() => {
    if (!manifest) {
      void loadLibrary()
      return
    }
    void (async () => {
      setSaveBusy(true)
      try {
        if (activeNotebookId) {
          const next = await saveNotebookState(manifest, activeNotebookId, state)
          setManifest(next)
        } else {
          const result = await createNotebookWithPayload(manifest, selectedParentId, state)
          if ('error' in result) {
            window.alert(result.error)
            return
          }
          setManifest(result.manifest)
          setActiveNotebookId(result.id)
        }
        setLastSavedJson(serializeNotebookToIpynbJson(state))
        await loadLibrary()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Save failed')
      } finally {
        setSaveBusy(false)
      }
    })()
  }, [activeNotebookId, loadLibrary, manifest, selectedParentId, state])

  const handleNewFolder = useCallback(() => {
    if (!manifest) return
    const name = window.prompt('Folder name')
    if (name === null) return
    const result = manifestAddFolder(manifest, name, selectedParentId)
    if ('error' in result) {
      window.alert(result.error)
      return
    }
    void (async () => {
      try {
        await storeManifest(result.manifest)
        setManifest(result.manifest)
        await loadLibrary()
      } catch (e) {
        window.alert(e instanceof Error ? e.message : 'Failed to create folder')
      }
    })()
  }, [loadLibrary, manifest, selectedParentId])

  const handleRename = useCallback(
    (id: string, currentName: string) => {
      if (!manifest) return
      const name = window.prompt('New name', currentName)
      if (name === null) return
      void (async () => {
        try {
          const r = await renameEntryInKv(manifest, id, name)
          if ('error' in r) {
            window.alert(r.error)
            return
          }
          setManifest(r.manifest)
          if (activeNotebookId === id) {
            dispatch({ type: 'SET_NOTEBOOK_TITLE', title: name })
          }
          await loadLibrary()
        } catch (e) {
          window.alert(e instanceof Error ? e.message : 'Rename failed')
        }
      })()
    },
    [activeNotebookId, dispatch, loadLibrary, manifest],
  )

  const handleDelete = useCallback(
    (id: string, name: string, kind: 'folder' | 'notebook') => {
      if (!manifest) return
      const label = kind === 'folder' ? `folder “${name}” and everything inside it` : `“${name}”`
      if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return
      void (async () => {
        try {
          const r = manifestRemove(manifest, id)
          if ('error' in r) {
            window.alert(r.error)
            return
          }
          await deleteNotebookPayloads(r.notebookIdsToDelete)
          await storeManifest(r.manifest)
          setManifest(r.manifest)
          if (kind === 'notebook' && activeNotebookId === id) {
            resetToFreshNotebook()
          }
          if (kind === 'folder' && activeNotebookId) {
            const stillThere = r.manifest.items.some((i) => i.id === activeNotebookId)
            if (!stillThere) resetToFreshNotebook()
          }
          await loadLibrary()
        } catch (e) {
          window.alert(e instanceof Error ? e.message : 'Delete failed')
        }
      })()
    },
    [activeNotebookId, loadLibrary, manifest, resetToFreshNotebook],
  )

  const handleConfirmMove = useCallback(
    (itemId: string, newParentId: string | null) => {
      if (!manifest) return
      void (async () => {
        try {
          const r = manifestMove(manifest, itemId, newParentId)
          if ('error' in r) {
            window.alert(r.error)
            return
          }
          await storeManifest(r.manifest)
          setManifest(r.manifest)
          setMovingId(null)
          await loadLibrary()
        } catch (e) {
          window.alert(e instanceof Error ? e.message : 'Move failed')
        }
      })()
    },
    [loadLibrary, manifest],
  )

  const handleImportFile = useCallback(
    (file: File) => {
      void (async () => {
        if (!confirmDiscard()) return
        try {
          const text = await file.text()
          const { title, cells } = parseIpynbJson(text, { filename: file.name })
          const prev = stateRef.current
          dispatch({ type: 'LOAD_NOTEBOOK', title, cells })
          setActiveNotebookId(null)
          setLastSavedJson(
            serializeNotebookToIpynbJson({
              ...prev,
              title,
              cells,
              selectedId: cells[0]?.id ?? null,
              executionCounter: 0,
            }),
          )
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to open notebook'
          window.alert(msg)
        }
      })()
    },
    [confirmDiscard, dispatch],
  )

  return (
    <div className="nb-page">
      <NotebookSidebar
        items={manifest?.items ?? []}
        loading={libraryLoading}
        error={libraryError}
        selectedNotebookId={activeNotebookId}
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
        <div className="nb-main">
          <Toolbar
            kernelStatus={state.kernelStatus}
            title={state.title}
            onTitleChange={(t) => dispatch({ type: 'SET_NOTEBOOK_TITLE', title: t })}
            onDownload={handleDownload}
            onImportFile={handleImportFile}
            onSave={handleSave}
            saveDisabled={saveBusy || libraryLoading || !manifest}
            dirty={dirty}
            onAddCodeCell={() => dispatch({ type: 'ADD_CELL', cellType: 'code' })}
            onAddMarkdownCell={() => dispatch({ type: 'ADD_CELL', cellType: 'markdown' })}
            onRunAll={runAll}
            onClearAllOutputs={() => dispatch({ type: 'CLEAR_ALL_OUTPUTS' })}
            onRestart={restartKernel}
            theme={theme}
            onThemeChange={setTheme}
          />
          {state.kernelStatus === 'loading' && (
            <div className="nb-loading">Loading Python kernel…</div>
          )}
          {state.kernelStatus === 'error' && (
            <div className="nb-loading nb-loading--error">
              Kernel failed to load. Check console for details.
            </div>
          )}
          <div className="nb-scroll">
            <CellList
              cells={state.cells}
              selectedId={state.selectedId}
              dispatch={dispatch}
              onRun={runCell}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
