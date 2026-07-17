import { useEffect, useMemo } from 'react'
import { Toolbar } from '@features/notebook/ui/Toolbar'
import { CellList } from '@features/notebook/ui/CellList'
import { NotebookTabs } from '@features/notebook/ui/NotebookTabs'
import { NotebookSidebar, useNotebookLibrary } from '@features/library'
import { tabIsDirty } from '@features/notebook/reducer/tabWorkspace'
import { useNotebookWorkspace } from '@features/notebook/hooks/useNotebookWorkspace'
import { WelcomePage } from '@features/welcome'
import { useAiCodeService, useDialogs, useTheme } from '@app/providers'
import { useTabNotebookRuntime } from '@features/notebook/hooks/useTabNotebookRuntime'
import { useCellRunner } from '@features/notebook/hooks/useCellRunner'
import { useNotebookLibraryActions } from '@features/notebook/hooks/useNotebookLibraryActions'
import { TabWidgetManagerProvider } from '@features/notebook/widgets/tabWidgetManagerProvider'
import { useNotebookPageCompleteCode } from '@features/notebook/hooks/useNotebookPageCompleteCode'
import { useNotebookPageAiGenerate } from '@features/notebook/hooks/useNotebookPageAiGenerate'
import { useNotebookPageTabChrome } from '@features/notebook/hooks/useNotebookPageTabChrome'
import { CriblSearchNotebookPickerModal } from '@features/notebook/ui/CriblSearchNotebookPickerModal'
import {
  fetchCriblSearchNotebook,
  listCriblSearchNotebooks,
} from '@app/criblSearchNotebookImport'

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

  const completeCode = useNotebookPageCompleteCode({
    activeTabIdRef,
    workspaceRef,
    runtime,
  })

  const aiCode = useAiCodeService()
  const { handleAiGenerateFromPrompt, aiCodeBusyCellId } = useNotebookPageAiGenerate({
    aiCode,
    showAlert,
    dispatchNotebook,
    runtime,
    activeTabIdRef,
    workspaceRef,
  })

  const { runCellAndAdvance, runAll, restartKernel, stopExecution, canStopExecution } =
    useCellRunner({ runtime, workspaceRef, activeTabIdRef, dispatch, activeTab, state })

  const {
    handleDownload,
    handleCloseTab,
    handleNewTab,
    handleSelectTab,
    handleNewNotebook,
  } = useNotebookPageTabChrome({
    workspaceRef,
    dispatch,
    showConfirm,
    activeTab,
    state,
  })

  const {
    handleSave,
    handleOpenNotebook,
    handleNewFolder,
    handleRename,
    handleEditNotebookTags,
    handleDelete,
    handleConfirmMove,
    handleImportFile,
    handleOpenExample,
    handleOpenCriblSearchPicker,
    handlePickerClose,
    handlePickerSelect,
    pickerOpen,
    pickerNotebooks,
    pickerError,
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
    criblSearchNotebookImport: {
      listNotebooks: listCriblSearchNotebooks,
      fetchNotebook: fetchCriblSearchNotebook,
    },
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
      <CriblSearchNotebookPickerModal
        open={pickerOpen}
        notebooks={pickerNotebooks}
        error={pickerError}
        onClose={handlePickerClose}
        onSelect={handlePickerSelect}
      />
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
                onEditNotebookTags={handleEditNotebookTags}
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
                        onImportFromCriblSearch={handleOpenCriblSearchPicker}
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
                            onImportFromCriblSearch={handleOpenCriblSearchPicker}
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
                                onMarkdownEmbedError={showAlert}
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
