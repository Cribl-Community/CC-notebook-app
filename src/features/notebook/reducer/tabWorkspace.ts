import { notebookReducer, initialState, createEmptyNotebookCells } from '@features/notebook/reducer/notebookReducer'
import type { Cell, NotebookAction, NotebookState } from '@features/notebook/model/types'
import { serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'
import { applyExampleDefaultCodeFold } from '@features/notebook/codeCellFold'

export type TabKind = 'welcome' | 'notebook' | 'chat'

/** True for tabs that own a runnable notebook + Pyodide kernel. */
export function isNotebookTabKind(kind: TabKind): kind is 'notebook' {
  return kind === 'notebook'
}

/** One open notebook in the workspace; each tab has its own Pyodide kernel in the UI layer. */
export interface NotebookTab {
  id: string
  kind: TabKind
  notebook: NotebookState
  /** Last persisted snapshot for dirty detection (KV save or explicit baseline). */
  lastSavedJson: string
  /** Cribl KV manifest entry id when this tab is linked to a saved notebook. */
  kvNotebookId: string | null
  /** Chat tabs only: notebook tab that AI cell tools write into. */
  linkedNotebookTabId?: string | null
}

function welcomeNotebookState(): NotebookState {
  return {
    title: 'Welcome',
    cells: [],
    selectedId: null,
    executionCounter: 0,
    kernelStatus: 'ready',
    kernelInit: {
      phase: 'ready',
      message: 'Welcome tab does not use a kernel',
      progressPercent: 100,
      startedAtMs: null,
      errorSummary: null,
      errorDetail: null,
    },
  }
}

export function createWelcomeTab(): NotebookTab {
  const notebook = welcomeNotebookState()
  return {
    id: crypto.randomUUID(),
    kind: 'welcome',
    notebook,
    lastSavedJson: serializeNotebookToIpynbJson(notebook),
    kvNotebookId: null,
  }
}

function chatNotebookState(): NotebookState {
  return {
    title: 'AI Chat',
    cells: [],
    selectedId: null,
    executionCounter: 0,
    kernelStatus: 'ready',
    kernelInit: {
      phase: 'ready',
      message: 'AI Chat tab does not use a kernel',
      progressPercent: 100,
      startedAtMs: null,
      errorSummary: null,
      errorDetail: null,
    },
  }
}

/** Workspace tab for multi-turn LLM chat that authors a linked notebook via tools. */
export function createChatTab(): NotebookTab {
  const notebook = chatNotebookState()
  return {
    id: crypto.randomUUID(),
    kind: 'chat',
    notebook,
    lastSavedJson: serializeNotebookToIpynbJson(notebook),
    kvNotebookId: null,
    linkedNotebookTabId: null,
  }
}

export interface WorkspaceState {
  tabs: NotebookTab[]
  activeTabId: string
}

export type WorkspaceAction =
  | { type: 'ADD_TAB'; tab?: NotebookTab }
  | { type: 'CLOSE_TAB'; tabId: string }
  | { type: 'SELECT_TAB'; tabId: string }
  | { type: 'TAB_NOTEBOOK'; tabId: string; action: NotebookAction }
  | {
      type: 'REPLACE_TAB_CONTENT'
      tabId: string
      title: string
      cells: Cell[]
      kvNotebookId: string | null
      /** When true, long non–Riptide-prompt code cells default to folded (unless .ipynb metadata already set). */
      collapseLongCodeCellsOnOpen?: boolean
    }
  | {
      type: 'SET_TAB_META'
      tabId: string
      lastSavedJson?: string
      kvNotebookId?: string | null
    }
  | {
      type: 'SET_CHAT_LINK'
      chatTabId: string
      linkedNotebookTabId: string | null
    }

export function createEmptyTab(): NotebookTab {
  const notebook: NotebookState = { ...initialState, cells: createEmptyNotebookCells() }
  return {
    id: crypto.randomUUID(),
    kind: 'notebook',
    notebook,
    lastSavedJson: serializeNotebookToIpynbJson(notebook),
    kvNotebookId: null,
  }
}

export function tabIsDirty(tab: NotebookTab): boolean {
  if (!isNotebookTabKind(tab.kind)) return false
  return serializeNotebookToIpynbJson(tab.notebook) !== tab.lastSavedJson
}

/** Cold start: one Welcome tab (not an empty Untitled notebook). */
export function createInitialWorkspace(): WorkspaceState {
  const tab = createWelcomeTab()
  return { tabs: [tab], activeTabId: tab.id }
}

export function tabWorkspaceReducer(state: WorkspaceState, action: WorkspaceAction): WorkspaceState {
  switch (action.type) {
    case 'ADD_TAB': {
      const tab = action.tab ?? createEmptyTab()
      return {
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      }
    }

    case 'CLOSE_TAB': {
      const tabs = state.tabs.filter((t) => t.id !== action.tabId)
      if (tabs.length === 0) {
        const fresh = createWelcomeTab()
        return { tabs: [fresh], activeTabId: fresh.id }
      }
      let activeTabId = state.activeTabId
      if (activeTabId === action.tabId) {
        const idx = state.tabs.findIndex((t) => t.id === action.tabId)
        const fallback = tabs[Math.max(0, idx - 1)] ?? tabs[0]
        activeTabId = fallback.id
      }
      return { tabs, activeTabId }
    }

    case 'SELECT_TAB':
      return state.tabs.some((t) => t.id === action.tabId)
        ? { ...state, activeTabId: action.tabId }
        : state

    case 'TAB_NOTEBOOK': {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId)
      if (idx === -1) return state
      if (!isNotebookTabKind(state.tabs[idx].kind)) return state
      const nextNotebook = notebookReducer(state.tabs[idx].notebook, action.action)
      const nextTabs = [...state.tabs]
      nextTabs[idx] = { ...state.tabs[idx], notebook: nextNotebook }
      return { ...state, tabs: nextTabs }
    }

    case 'REPLACE_TAB_CONTENT': {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId)
      if (idx === -1) return state
      if (!isNotebookTabKind(state.tabs[idx].kind)) return state
      let cells = action.cells.length > 0 ? action.cells : createEmptyNotebookCells()
      if (action.collapseLongCodeCellsOnOpen) {
        cells = applyExampleDefaultCodeFold(cells)
      }
      const title = action.title.trim()
      const notebook = notebookReducer(state.tabs[idx].notebook, {
        type: 'LOAD_NOTEBOOK',
        title: title.length > 0 ? title : 'Untitled',
        cells,
      })
      const nextTabs = [...state.tabs]
      nextTabs[idx] = {
        ...state.tabs[idx],
        notebook,
        lastSavedJson: serializeNotebookToIpynbJson(notebook),
        kvNotebookId: action.kvNotebookId,
      }
      return { ...state, tabs: nextTabs }
    }

    case 'SET_TAB_META': {
      const idx = state.tabs.findIndex((t) => t.id === action.tabId)
      if (idx === -1) return state
      if (!isNotebookTabKind(state.tabs[idx].kind)) return state
      const nextTabs = [...state.tabs]
      const cur = state.tabs[idx]
      nextTabs[idx] = {
        ...cur,
        lastSavedJson: action.lastSavedJson ?? cur.lastSavedJson,
        kvNotebookId: action.kvNotebookId !== undefined ? action.kvNotebookId : cur.kvNotebookId,
      }
      return { ...state, tabs: nextTabs }
    }

    case 'SET_CHAT_LINK': {
      const idx = state.tabs.findIndex((t) => t.id === action.chatTabId)
      if (idx === -1) return state
      if (state.tabs[idx].kind !== 'chat') return state
      const nextTabs = [...state.tabs]
      nextTabs[idx] = {
        ...state.tabs[idx],
        linkedNotebookTabId: action.linkedNotebookTabId,
      }
      return { ...state, tabs: nextTabs }
    }

    default:
      return state
  }
}
