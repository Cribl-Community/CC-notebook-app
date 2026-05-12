import { useCallback, useEffect, useState, useMemo } from 'react'
import type { CompletionItem } from '@ports/KernelPort'
import type { CellId } from '@features/notebook/model/types'
import { serializeNotebookToIpynbJson, titleToDownloadFilename } from '@features/notebook/codec/ipynb'
import { Toolbar } from '@features/notebook/ui/Toolbar'
import { CellList } from '@features/notebook/ui/CellList'
import { NotebookSidebar } from '@features/library/ui/NotebookSidebar'
import { NotebookTabs } from '@features/notebook/ui/NotebookTabs'
import { useNotebookLibrary } from '@features/library/hooks/useNotebookLibrary'
import { tabIsDirty } from '@features/notebook/reducer/tabWorkspace'
import { useNotebookWorkspace } from '@features/notebook/hooks/useNotebookWorkspace'
import { WelcomePage } from '@features/welcome/WelcomePage'
import { formatGeneratedPythonSource } from '@features/ai-riptide/riptideService'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import { runRiptidePromptJinjaInKernel } from '@features/notebook/jinjaInKernel'
import { looksLikeJinjaTemplate } from '@features/notebook/jinjaTemplateHeuristic'
// eslint-disable-next-line no-restricted-imports -- shell reads ports from composition root
import { useAiCodeService, useDialogs, useTheme } from '@app/providers'
import { useTabNotebookRuntime } from '@features/notebook/hooks/useTabNotebookRuntime'
import { useCellRunner } from '@features/notebook/hooks/useCellRunner'
import { useNotebookLibraryActions } from '@features/notebook/hooks/useNotebookLibraryActions'
import { TabWidgetManagerProvider } from '@features/notebook/widgets/tabWidgetManagerProvider'

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
    loading: libraryLoading,
    error: libraryError,
    selectedParentId,
    setSelectedParentId,
    movingId,
    setMovingId,
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
        let promptForApi = trimmed
        if (looksLikeJinjaTemplate(trimmed)) {
          const tid = activeTabIdRef.current
          const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
          if (!tab || tab.kind === 'welcome') {
            showAlert('Open a notebook tab to use Jinja in the Riptide prompt.')
            return
          }
          const ks = tab.notebook.kernelStatus
          if (ks === 'loading' || ks === 'error') {
            showAlert(
              ks === 'loading'
                ? 'Wait for the Python kernel to finish loading before using Jinja in the prompt.'
                : 'The Python kernel is in an error state; fix or restart the kernel to use Jinja in the prompt.',
            )
            return
          }
          const kernel = runtime.kernelFor(tid)
          if (!kernel) {
            showAlert('Python kernel is not available. Wait until the kernel is ready and try again.')
            return
          }
          try {
            await kernel.ready
          } catch {
            showAlert('Python kernel failed to initialize.')
            return
          }
          const jinja = await runRiptidePromptJinjaInKernel(kernel, trimmed, {
            executionCount: 0,
            emitIOPub: () => {
              /* no cell IOPub for inline Jinja helper */
            },
            filterPyodidePackageChatter,
          })
          if (!jinja.ok) {
            showAlert(jinja.errorMessage)
            return
          }
          promptForApi = jinja.text
        }

        const code = await aiCode.generatePythonFromPrompt(promptForApi)
        const source = formatGeneratedPythonSource(trimmed, code)
        dispatchNotebook({ type: 'UPDATE_SOURCE', id: cellId, source })
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Riptide request failed.')
      } finally {
        setAiCodeBusyCellId(null)
      }
    },
    [aiCode, showAlert, dispatchNotebook, runtime, activeTabIdRef, workspaceRef],
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

  const handleNewNotebook = useCallback(() => {
    dispatch({ type: 'ADD_TAB' })
  }, [])

  const {
    handleSave,
    handleOpenNotebook,
    handleNewFolder,
    handleRename,
    handleDelete,
    handleConfirmMove,
    handleImportFile,
    handleOpenExample,
    saveDisabled,
  } = useNotebookLibraryActions({
    workspace: {
      workspace,
      dispatch,
      workspaceRef,
      activeTabIdRef,
      activeTab,
      tabIdsKey,
      dirty,
      dispatchNotebook,
      dispatchNotebookForTab,
    },
    runtime,
    library,
    showAlert,
    showConfirm,
    showPrompt,
  })

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
  const kernelInit = state?.kernelInit

  return (
    <>
      <div className="nb-app-frame" data-testid="notebook-app-root">
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
                    saveDisabled={saveDisabled}
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
                      <WelcomePage
                        onOpenExample={handleOpenExample}
                        onNewNotebook={handleNewTab}
                        onImportFile={handleImportFile}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    {state.kernelStatus === 'loading' && (
                      <div className="nb-loading nb-kernel-banner" role="status" aria-live="polite">
                        <div className="nb-kernel-banner-header">
                          <strong>Loading Python kernel</strong>
                          {kernelInit?.phase && (
                            <span className="nb-kernel-banner-phase">{kernelInit.phase}</span>
                          )}
                        </div>
                        <div className="nb-kernel-banner-message">
                          {kernelInit?.message || 'Preparing Python runtime'}
                        </div>
                        {kernelInit?.progressPercent != null && (
                          <>
                            <div
                              className="nb-kernel-banner-progress"
                              role="progressbar"
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={Math.max(0, Math.min(100, kernelInit.progressPercent))}
                            >
                              <div
                                className="nb-kernel-banner-progress-fill"
                                style={{
                                  width: `${Math.max(0, Math.min(100, kernelInit.progressPercent))}%`,
                                }}
                              />
                            </div>
                            <div className="nb-kernel-banner-meta">
                              {Math.round(kernelInit.progressPercent)}% complete
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {state.kernelStatus === 'error' && (
                      <div className="nb-loading nb-loading--error nb-kernel-banner" role="alert">
                        <div className="nb-kernel-banner-header">
                          <strong>Kernel failed to load</strong>
                          <button className="nb-btn nb-btn-stop" type="button" onClick={restartKernel}>
                            Retry startup
                          </button>
                        </div>
                        <div className="nb-kernel-banner-message">
                          {kernelInit?.errorSummary || 'Check console for additional details.'}
                        </div>
                        {kernelInit?.errorDetail && (
                          <details className="nb-kernel-banner-details">
                            <summary>Show technical details</summary>
                            <pre className="nb-output-pre">{kernelInit.errorDetail}</pre>
                          </details>
                        )}
                      </div>
                    )}
                    <div className="nb-main">
                      <div className="nb-scroll">
                        <TabWidgetManagerProvider
                          manager={
                            activeTab && activeTab.kind === 'notebook'
                              ? runtime.widgetManagerFor(activeTab.id)
                              : null
                          }
                        >
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
                        </TabWidgetManagerProvider>
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
