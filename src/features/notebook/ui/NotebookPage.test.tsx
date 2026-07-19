import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { KernelStatus, NotebookState } from '@features/notebook/model/types'
import { NotebookPage } from './NotebookPage'

const restartKernelMock = vi.fn()

let currentKernelStatus: KernelStatus = 'loading'
let currentKernelInit: NotebookState['kernelInit'] = {
  phase: 'runtime',
  message: 'Loading Python runtime',
  progressPercent: 45,
  startedAtMs: null,
  errorSummary: null,
  errorDetail: null,
}

vi.mock('@app/providers', () => ({
  useTheme: () => ({
    themeMode: 'light',
    setThemeMode: vi.fn(),
    codeMirrorLuma: 'light',
    toggleThemeMode: vi.fn(),
  }),
  useDialogs: () => ({ alert: vi.fn(), confirm: vi.fn().mockResolvedValue(true), prompt: vi.fn() }),
  useAiCodeService: () => ({
    isAvailable: () => false,
    generatePythonFromPrompt: vi.fn(),
    suggestErrorFix: vi.fn(),
  }),
  useAiChatService: () => ({
    isAvailable: () => false,
    runAgentTurn: vi.fn(),
  }),
  useEnv: () => ({ apiBase: '', isCriblHosted: false, isKvMock: true, staticAssetPrefix: '/' }),
  useSearchService: () => ({
    runSearch: vi.fn(),
    translateEnglishToKql: vi.fn(),
  }),
}))

vi.mock('@features/library/hooks/useNotebookLibrary', () => ({
  useNotebookLibrary: () => ({
    manifest: { items: [] },
    loading: false,
    error: null,
    selectedParentId: null,
    setSelectedParentId: vi.fn(),
    movingId: null,
    setMovingId: vi.fn(),
    moveDestinations: [],
    reload: vi.fn(),
  }),
}))

vi.mock('@features/notebook/hooks/useNotebookLibraryActions', () => ({
  useNotebookLibraryActions: () => ({
    handleSave: vi.fn(),
    handleOpenNotebook: vi.fn(),
    handleNewFolder: vi.fn(),
    handleRename: vi.fn(),
    handleDelete: vi.fn(),
    handleConfirmMove: vi.fn(),
    handleImportFile: vi.fn(),
    handleOpenExample: vi.fn(),
    saveDisabled: false,
  }),
}))

vi.mock('@features/notebook/hooks/useTabNotebookRuntime', () => ({
  useTabNotebookRuntime: () => ({
    kernelFor: () => null,
    widgetManagerFor: () => null,
  }),
}))

vi.mock('@features/notebook/hooks/useCellRunner', () => ({
  useCellRunner: () => ({
    runCellAndAdvance: vi.fn(),
    runAll: vi.fn(),
    restartKernel: restartKernelMock,
    stopExecution: vi.fn(),
    canStopExecution: false,
  }),
}))

vi.mock('@features/notebook/hooks/useNotebookWorkspace', () => ({
  useNotebookWorkspace: () => {
    const notebook = {
      title: 'Notebook',
      cells: [],
      selectedId: null,
      executionCounter: 0,
      kernelStatus: currentKernelStatus,
      kernelInit: currentKernelInit,
    }
    const tab = { id: 't1', kind: 'notebook', notebook, kvNotebookId: null, lastSavedJson: '' }
    const workspace = { tabs: [tab], activeTabId: 't1' }
    return {
      workspace,
      dispatch: vi.fn(),
      workspaceRef: { current: workspace },
      activeTabIdRef: { current: 't1' },
      activeTab: tab,
      tabIdsKey: 't1',
      dirty: false,
      dispatchNotebook: vi.fn(),
      dispatchNotebookForTab: vi.fn(),
    }
  },
}))

vi.mock('@features/notebook/ui/Toolbar', () => ({
  Toolbar: () => <div data-testid="toolbar" />,
}))
vi.mock('@features/notebook/ui/CellList', () => ({
  CellList: () => <div data-testid="cell-list" />,
}))
vi.mock('@features/library/ui/NotebookSidebar', () => ({
  NotebookSidebar: () => <div data-testid="sidebar" />,
}))
vi.mock('@features/notebook/ui/NotebookTabs', () => ({
  NotebookTabs: () => <div data-testid="tabs" />,
}))
vi.mock('@features/welcome/WelcomePage', () => ({
  WelcomePage: () => <div data-testid="welcome" />,
}))
vi.mock('@features/ai-chat', () => ({
  AiChatTab: () => <div data-testid="ai-chat" />,
}))

describe('NotebookPage kernel banner', () => {
  beforeEach(() => {
    restartKernelMock.mockReset()
  })

  it('renders loading phase and progress details', () => {
    currentKernelStatus = 'loading'
    currentKernelInit = {
      phase: 'runtime',
      message: 'Loading Python runtime',
      progressPercent: 45,
      startedAtMs: null,
      errorSummary: null,
      errorDetail: null,
    }
    render(<NotebookPage />)

    expect(screen.getByText('Loading Python kernel')).toBeInTheDocument()
    expect(screen.getByText('runtime')).toBeInTheDocument()
    expect(screen.getByText('45% complete')).toBeInTheDocument()
  })

  it('shows error details and retries startup', () => {
    currentKernelStatus = 'error'
    currentKernelInit = {
      phase: 'error',
      message: 'Kernel startup failed',
      progressPercent: null,
      startedAtMs: null,
      errorSummary: 'Worker import failed',
      errorDetail: 'stack details',
    }
    render(<NotebookPage />)

    expect(screen.getByText('Kernel failed to load')).toBeInTheDocument()
    expect(screen.getByText('Worker import failed')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry startup' }))
    expect(restartKernelMock).toHaveBeenCalledTimes(1)
  })
})
