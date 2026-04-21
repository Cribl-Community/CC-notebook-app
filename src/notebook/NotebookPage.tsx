import { useReducer, useRef, useCallback, useEffect, useState, useMemo } from 'react'
import type { CompletionItem } from '../pyodide/types'
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
import { WelcomePage } from './WelcomePage'
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
import { filterPyodidePackageChatter } from './criblSearchStreamFilter'
import { DEFAULT_CRIBL_SEARCH_MAX_ROWS, runCriblSearchJob } from '../cribl/searchJobs'
import { translateEnglishToKql } from '../cribl/aiTranslate'
import { formatGeneratedPythonSource, generatePythonFromPrompt } from '../cribl/riptideCode'
import { getCriblApiBase } from '../cribl/kvstore'
import {
  CRIBL_SEARCH_MIME,
  type CriblSearchPayload,
  type IOPubMessage,
} from '../pyodide/types'
import { useTabNotebookRuntime } from './useTabNotebookRuntime'

function criblSearchPlainSummary(p: CriblSearchPayload): string {
  if (p.kind === 'running') return `Cribl Search: ${p.label}`
  if (p.kind === 'failed') return `Cribl Search failed: ${p.message}`
  const total =
    p.totalRecords != null && p.totalRecords !== p.recordsReturned
      ? `${p.recordsReturned} records (${p.totalRecords} total)`
      : `${p.recordsReturned} records`
  return `Cribl Search: ${total}`
}

function criblSearchIOPub(
  payload: CriblSearchPayload,
  display_id: string,
  update: boolean,
): IOPubMessage {
  const data = {
    'text/plain': criblSearchPlainSummary(payload),
    [CRIBL_SEARCH_MIME]: JSON.stringify(payload),
  }
  if (update) {
    return {
      msg_type: 'update_display_data',
      data,
      metadata: {},
      transient: { display_id },
    }
  }
  return {
    msg_type: 'display_data',
    data,
    metadata: {},
    transient: { display_id },
  }
}

function formatCriblSearchError(raw: string, generatedQuery?: string): string {
  const msg = raw.trim()
  if (/Search job create failed \(400\)/i.test(msg) && /no viable alternative/i.test(msg)) {
    const parts = [
      'Generated KQL is invalid for Cribl Search (parser error).',
      'Try refining the English prompt, include `dataset=...` in the magic header, or run with `lang=kql`.',
    ]
    if (generatedQuery && generatedQuery.trim().length > 0) {
      parts.push(`Generated KQL:\n${generatedQuery}`)
    }
    return parts.join('\n\n')
  }
  if (/AI translation/i.test(msg) || /did not return a valid KQL/i.test(msg)) {
    const parts = ['Natural-language to KQL translation failed.']
    if (generatedQuery && generatedQuery.trim().length > 0) {
      parts.push(`Generated KQL candidate:\n${generatedQuery}`)
    }
    parts.push(msg)
    return parts.join('\n\n')
  }
  if (generatedQuery && generatedQuery.trim().length > 0) {
    return `${msg}\n\nGenerated KQL:\n${generatedQuery}`
  }
  return msg
}

function formatCriblSearchJsonRows(rows: Record<string, unknown>[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`
}

function formatCriblSearchRawRows(rows: Record<string, unknown>[]): string {
  const lines = rows.map((row) => {
    const raw = row._raw
    if (typeof raw === 'string') return raw
    return JSON.stringify(row)
  })
  return `${lines.join('\n')}\n`
}

type DialogState =
  | { kind: 'alert'; message: string }
  | { kind: 'confirm'; message: string }
  | { kind: 'prompt'; title: string; label: string; defaultValue: string; input: string }

export function NotebookPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const s = localStorage.getItem('nb-theme')
      if (s === 'dark') return 'dark'
    } catch {
      /* localStorage unavailable */
    }
    return 'light'
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('nb-theme', theme)
    } catch {
      // localStorage unavailable in sandboxed iframe — theme resets on reload
    }
  }, [theme])

  const [workspace, dispatch] = useReducer(tabWorkspaceReducer, undefined, () => createInitialWorkspace())

  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [libraryLoading, setLibraryLoading] = useState(true)
  const [libraryError, setLibraryError] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)
  const [aiCodeBusyCellId, setAiCodeBusyCellId] = useState<CellId | null>(null)
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
      if (activeTab && activeTab.kind === 'notebook') {
        localStorage.setItem('nb-notebook-title', activeTab.notebook.title)
      }
    } catch {
      // ignore
    }
  }, [activeTab])

  const moveDestinations = useMemo(
    () => (movingId ? listMoveTargets(manifest?.items ?? [], movingId) : []),
    [manifest, movingId],
  )

  const tabIdsKey = workspace.tabs.map((t) => t.id).join(',')

  const {
    kernelsRef,
    tabGensRef,
    tabQueuesRef,
    tabExecCountersRef,
    tabScheduledIdsRef,
    getRunQueue,
    getScheduledSet,
    initKernelForTab,
    restartKernelForTab,
  } = useTabNotebookRuntime(dispatch, workspaceRef, tabIdsKey)

  const dispatchNotebook = useCallback((action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId: activeTabIdRef.current, action })
  }, [])

  const dispatchNotebookForTab = useCallback((tabId: string, action: NotebookAction) => {
    dispatch({ type: 'TAB_NOTEBOOK', tabId, action })
  }, [])

  const completeCode = useCallback(
    async (code: string, cursor: number): Promise<CompletionItem[] | null> => {
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return null
      const kernel = kernelsRef.current.get(tid)
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

  const handleAiGenerateFromPrompt = useCallback(
    async (cellId: CellId, prompt: string) => {
      if (!getCriblApiBase()) {
        showAlert(
          'Riptide code generation requires the app to run inside Cribl with AI APIs enabled. Local development mode has no API base URL.',
        )
        return
      }
      const trimmed = prompt.trim()
      if (!trimmed) return
      setAiCodeBusyCellId(cellId)
      try {
        const code = await generatePythonFromPrompt(trimmed)
        const source = formatGeneratedPythonSource(trimmed, code)
        dispatchNotebook({ type: 'UPDATE_SOURCE', id: cellId, source })
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Riptide request failed.')
      } finally {
        setAiCodeBusyCellId(null)
      }
    },
    [showAlert, dispatchNotebook],
  )

  const runCell = useCallback(
    (id: CellId) => {
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return
      const kernel = kernelsRef.current.get(tid)
      if (!kernel) return

      const cell = tab.notebook.cells.find((c) => c.id === id)
      if (!cell || cell.cell_type !== 'code') return
      const source = cell.source
      const myGen = tabGensRef.current.get(tid) ?? 0

      const scheduled = getScheduledSet(tid)
      if (scheduled.has(id)) return
      scheduled.add(id)

      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ENQUEUE_CELL', id } })

      const q = getRunQueue(tid)
      q.p = q.p.then(async () => {
        if (tabGensRef.current.get(tid) !== myGen) {
          scheduled.delete(id)
          return
        }

        dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_RUNNING', id } })

        try {
          await kernel.ready
          if (tabGensRef.current.get(tid) !== myGen) return

          dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_KERNEL_STATUS', status: 'busy' } })
          const prevCount = tabExecCountersRef.current.get(tid) ?? 0
          const count = prevCount + 1
          tabExecCountersRef.current.set(tid, count)

          const emitIOPub = (msg: IOPubMessage) => {
            if (tabGensRef.current.get(tid) !== myGen) return
            dispatch({
              type: 'TAB_NOTEBOOK',
              tabId: tid,
              action: { type: 'IOPUB', id, msg, executionCount: count },
            })
          }

          const magic = parseCriblSearchMagic(source)
          if (magic.kind === 'error') {
            emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${magic.message}\n` })
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
            return
          }

          if (magic.kind === 'cribl_search') {
            const { varName, query, preview, response, earliest, latest, limit, lang, dataset } = magic.value
            const displayId = `cribl-search-${id}`
            let generatedKqlForReport: string | undefined
            try {
              emitIOPub(
                criblSearchIOPub(
                  { kind: 'running', progress: 0.06, label: 'Starting search…' },
                  displayId,
                  false,
                ),
              )

              let searchQuery = query
              if (lang === 'english') {
                if (!getCriblApiBase()) {
                  emitIOPub(
                    criblSearchIOPub(
                      {
                        kind: 'running',
                        progress: 0.14,
                        label: 'Local dev mode: skipping AI translation (using query as-is)…',
                      },
                      displayId,
                      true,
                    ),
                  )
                } else {
                  emitIOPub(
                    criblSearchIOPub(
                      { kind: 'running', progress: 0.14, label: 'Translating query to KQL…' },
                      displayId,
                      true,
                    ),
                  )
                  searchQuery = await translateEnglishToKql(query, { datasetHint: dataset })
                  generatedKqlForReport = searchQuery
                  emitIOPub({
                    msg_type: 'stream',
                    name: 'stdout',
                    text: `Generated KQL:\n${searchQuery}\n`,
                  })
                }
              }

              const { rows, columns, totalRecords } = await runCriblSearchJob({
                query: searchQuery,
                queryMode: 'verbatim',
                maxRows: limit,
                earliest,
                latest,
                onProgress: (ev) => {
                  emitIOPub(
                    criblSearchIOPub(
                      { kind: 'running', progress: ev.fraction, label: ev.label },
                      displayId,
                      true,
                    ),
                  )
                },
              })
              if (tabGensRef.current.get(tid) !== myGen) return

              emitIOPub(
                criblSearchIOPub(
                  {
                    kind: 'completed',
                    columns,
                    rows: preview && response === 'dataframe' ? rows.slice(0, DEFAULT_CRIBL_SEARCH_MAX_ROWS) : [],
                    recordsReturned: rows.length,
                    totalRecords,
                    dataframeVar: varName,
                    showTable: preview && response === 'dataframe',
                  },
                  displayId,
                  true,
                ),
              )
              if (response === 'dataframe') {
                const b64 = encodeRowsJsonForPythonBase64(rows)
                /** Rich table already shows rows; never add `print(df.head())` (avoids duplicate text). */
                const code = buildCriblSearchDataframeCode(varName, b64, false)
                let sawError = false
                await kernel.execute(
                  code,
                  (msg) => {
                    if (msg.msg_type === 'stream') {
                      const filtered = filterPyodidePackageChatter(msg.text)
                      if (filtered.length === 0) return
                      emitIOPub({ ...msg, text: filtered })
                      return
                    }
                    if (msg.msg_type === 'error') sawError = true
                    emitIOPub(msg)
                  },
                  count,
                )

                if (tabGensRef.current.get(tid) !== myGen) return

                if (sawError) {
                  dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
                } else {
                  dispatch({
                    type: 'TAB_NOTEBOOK',
                    tabId: tid,
                    action: { type: 'FINISH_CELL', id, execution_count: count },
                  })
                }
              } else {
                const text = response === 'json' ? formatCriblSearchJsonRows(rows) : formatCriblSearchRawRows(rows)
                emitIOPub({ msg_type: 'stream', name: 'stdout', text })
                dispatch({
                  type: 'TAB_NOTEBOOK',
                  tabId: tid,
                  action: { type: 'FINISH_CELL', id, execution_count: count },
                })
              }
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e)
              const pretty = formatCriblSearchError(errMsg, lang === 'english' ? generatedKqlForReport : undefined)
              if (tabGensRef.current.get(tid) === myGen) {
                emitIOPub(
                  criblSearchIOPub(
                    { kind: 'failed', message: pretty },
                    displayId,
                    true,
                  ),
                )
              }
              dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
            }
            return
          }

          let sawError = false
          await kernel.execute(
            source,
            (msg) => {
              if (msg.msg_type === 'error') sawError = true
              emitIOPub(msg)
            },
            count,
          )

          if (tabGensRef.current.get(tid) !== myGen) return

          if (sawError) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
          } else {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'FINISH_CELL', id, execution_count: count } })
          }
        } catch {
          if (tabGensRef.current.get(tid) === myGen) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id } })
          }
        } finally {
          scheduled.delete(id)
          if (tabGensRef.current.get(tid) === myGen) {
            dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'SET_KERNEL_STATUS', status: 'ready' } })
          }
        }
      })
    },
    [getRunQueue, getScheduledSet],
  )

  const runCellAndAdvance = useCallback(
    (id: CellId, cellIndex: number) => {
      runCell(id)
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || tab.kind === 'welcome') return
      const cells = tab.notebook.cells
      if (cellIndex < cells.length - 1) {
        dispatch({
          type: 'TAB_NOTEBOOK',
          tabId: tid,
          action: { type: 'SELECT_CELL', id: cells[cellIndex + 1]!.id },
        })
      } else {
        dispatch({
          type: 'TAB_NOTEBOOK',
          tabId: tid,
          action: { type: 'ADD_CELL', afterId: id, cellType: 'code' },
        })
      }
    },
    [runCell],
  )

  const runAll = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (!tab || tab.kind === 'welcome') return
    tab.notebook.cells
      .filter((c) => c.cell_type === 'code')
      .forEach((cell) => runCell(cell.id))
  }, [runCell])

  const restartKernel = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (tab?.kind === 'welcome') return
    restartKernelForTab(tid)
  }, [restartKernelForTab])

  const stopExecution = useCallback(() => {
    const tid = activeTabIdRef.current
    const tab0 = workspaceRef.current.tabs.find((t) => t.id === tid)
    if (tab0?.kind === 'welcome') return
    const prevGen = tabGensRef.current.get(tid) ?? 0
    tabGensRef.current.set(tid, prevGen + 1)

    tabScheduledIdsRef.current.get(tid)?.clear()
    dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'CLEAR_ALL_PENDING' } })

    const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
    const runningId = tab?.notebook.cells.find(
      (c) => c.cell_type === 'code' && c.execution_state === 'running',
    )?.id

    kernelsRef.current.get(tid)?.dispose()
    kernelsRef.current.delete(tid)

    const q = tabQueuesRef.current.get(tid)
    if (q) q.p = Promise.resolve()

    if (runningId) {
      dispatch({
        type: 'TAB_NOTEBOOK',
        tabId: tid,
        action: {
          type: 'IOPUB',
          id: runningId,
          msg: { msg_type: 'stream', name: 'stderr', text: 'Execution stopped.\n' },
          executionCount: null,
        },
      })
      dispatch({ type: 'TAB_NOTEBOOK', tabId: tid, action: { type: 'ERROR_CELL', id: runningId } })
    }

    initKernelForTab(tid)
  }, [initKernelForTab])

  const canStopExecution = useMemo(() => {
    if (!activeTab || activeTab.kind === 'welcome') return false
    if (!state) return false
    if (state.kernelStatus === 'loading' || state.kernelStatus === 'error') return false
    if (state.kernelStatus === 'busy') return true
    return state.cells.some(
      (c) =>
        c.cell_type === 'code' &&
        (c.execution_state === 'running' || c.execution_state === 'pending'),
    )
  }, [state, activeTab])

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
          restartKernelForTab(tab.id)
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Failed to open notebook'
          showAlert(msg)
        }
      })()
    },
    [restartKernelForTab, showAlert],
  )

  const handleOpenExample = useCallback(
    (filename: string) => {
      const tab = createEmptyTab()
      dispatch({ type: 'ADD_TAB', tab })
      void (async () => {
        try {
          const base = import.meta.env.BASE_URL || '/'
          const prefix = base.endsWith('/') ? base : `${base}/`
          const res = await fetch(`${prefix}Examples/${filename}`)
          if (!res.ok) throw new Error(`Could not load example (${res.status})`)
          const text = await res.text()
          const { title, cells } = ipynbTextToLoadPayload(text)
          dispatch({
            type: 'REPLACE_TAB_CONTENT',
            tabId: tab.id,
            title,
            cells: cells.length > 0 ? cells : createEmptyNotebookCells(),
            kvNotebookId: null,
          })
          restartKernelForTab(tab.id)
        } catch (e) {
          showAlert(e instanceof Error ? e.message : 'Failed to open example')
        }
      })()
    },
    [restartKernelForTab, showAlert],
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
                    theme={theme}
                    onThemeChange={setTheme}
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
                          theme={theme}
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
