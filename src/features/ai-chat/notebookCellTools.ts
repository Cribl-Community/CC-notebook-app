import type { Dispatch, MutableRefObject } from 'react'
import { parseCriblApiMagic } from '@features/cribl-api/criblApiMagic'
import { parseCriblSearchMagic } from '@features/cribl-search/criblSearchMagic'
import { parseCriblSearchLookupMagic } from '@features/cribl-search/criblSearchLookupMagic'
import {
  createEmptyTab,
  isNotebookTabKind,
  tabWorkspaceReducer,
  type WorkspaceAction,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import type { AgentToolCall } from '@ports/AiAgentChatService'

export type NotebookToolHost = {
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
  chatTabId: string
}

/**
 * Wrap workspace dispatch so {@link workspaceRef} stays in sync during a synchronous
 * tool loop (React only mirrors state into the ref after paint).
 *
 * Actions must be deterministic when applied twice (ref + React). Prefer stable
 * ids on `ADD_CELL` (`id` + `source`) so UUID generation does not diverge.
 */
export function syncWorkspaceDispatch(
  workspaceRef: MutableRefObject<WorkspaceState>,
  dispatch: Dispatch<WorkspaceAction>,
): Dispatch<WorkspaceAction> {
  return (action) => {
    workspaceRef.current = tabWorkspaceReducer(workspaceRef.current, action)
    dispatch(action)
  }
}

function ensureLinkedNotebook(host: NotebookToolHost): string {
  const chat = host.workspaceRef.current.tabs.find((t) => t.id === host.chatTabId)
  if (!chat || chat.kind !== 'chat') {
    throw new Error('Chat tab not found.')
  }
  const linked = chat.linkedNotebookTabId
  if (linked) {
    const nb = host.workspaceRef.current.tabs.find((t) => t.id === linked)
    if (nb && isNotebookTabKind(nb.kind)) return linked
  }
  const tab = createEmptyTab()
  host.dispatch({ type: 'ADD_TAB', tab })
  // Keep chat selected — ADD_TAB selects the new notebook; re-select chat.
  host.dispatch({ type: 'SELECT_TAB', tabId: host.chatTabId })
  host.dispatch({
    type: 'SET_CHAT_LINK',
    chatTabId: host.chatTabId,
    linkedNotebookTabId: tab.id,
  })
  return tab.id
}

function appendCell(
  host: NotebookToolHost,
  notebookTabId: string,
  cellType: 'code' | 'markdown',
  source: string,
): { cellId: string; index: number } {
  const before = host.workspaceRef.current.tabs.find((t) => t.id === notebookTabId)
  const onlyEmptyCode =
    before?.notebook.cells.length === 1 &&
    before.notebook.cells[0]?.cell_type === 'code' &&
    before.notebook.cells[0].source.trim() === ''

  // Reuse the default empty code cell from createEmptyTab on the first write.
  if (onlyEmptyCode && cellType === 'code' && before.notebook.cells[0]) {
    const cellId = before.notebook.cells[0].id
    host.dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: notebookTabId,
      action: { type: 'UPDATE_SOURCE', id: cellId, source },
    })
    return { cellId, index: 0 }
  }

  // Stable id+source so syncWorkspaceDispatch (ref + React) applies identically.
  // Without this, ADD_CELL generates a new UUID per reducer call and UPDATE_SOURCE
  // targets the ref-only id, leaving React cells empty.
  const cellId = crypto.randomUUID()
  host.dispatch({
    type: 'TAB_NOTEBOOK',
    tabId: notebookTabId,
    action: { type: 'ADD_CELL', cellType, id: cellId, source },
  })
  // Exit markdown edit mode for readability when opening later
  if (cellType === 'markdown') {
    host.dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: notebookTabId,
      action: { type: 'TOGGLE_MARKDOWN_EDIT', id: cellId },
    })
  }
  // If we still have a leading empty code placeholder after adding markdown first, drop it.
  const afterAdd = host.workspaceRef.current.tabs.find((t) => t.id === notebookTabId)
  const lead = afterAdd?.notebook.cells[0]
  if (
    lead &&
    lead.id !== cellId &&
    lead.cell_type === 'code' &&
    lead.source.trim() === '' &&
    (afterAdd?.notebook.cells.length ?? 0) > 1
  ) {
    host.dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: notebookTabId,
      action: { type: 'DELETE_CELL', id: lead.id },
    })
  }
  const after = host.workspaceRef.current.tabs.find((t) => t.id === notebookTabId)
  const index = after?.notebook.cells.findIndex((c) => c.id === cellId) ?? -1
  return { cellId, index }
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || '{}') as unknown
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>
  } catch {
    /* fall through */
  }
  return {}
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

/**
 * Execute one notebook-authoring tool call; returns JSON string for role=tool content.
 */
export function executeNotebookTool(host: NotebookToolHost, call: AgentToolCall): string {
  try {
    const args = parseArgs(call.function.arguments)
    const notebookTabId = ensureLinkedNotebook(host)

    switch (call.function.name) {
      case 'set_notebook_title': {
        const title = str(args.title).trim() || 'Untitled'
        host.dispatch({
          type: 'TAB_NOTEBOOK',
          tabId: notebookTabId,
          action: { type: 'SET_NOTEBOOK_TITLE', title },
        })
        return JSON.stringify({ ok: true, title, notebookTabId })
      }
      case 'create_markdown_cell': {
        const source = str(args.source)
        const { cellId, index } = appendCell(host, notebookTabId, 'markdown', source)
        return JSON.stringify({ ok: true, cellId, index, cell_type: 'markdown' })
      }
      case 'create_python_cell': {
        const source = str(args.source)
        if (/^\s*%%cribl_/m.test(source)) {
          return JSON.stringify({
            ok: false,
            error: 'Use create_search_cell / create_api_cell / create_lookup_cell for magic cells.',
          })
        }
        const { cellId, index } = appendCell(host, notebookTabId, 'code', source)
        return JSON.stringify({ ok: true, cellId, index, cell_type: 'code' })
      }
      case 'create_search_cell': {
        const headerParams = str(args.headerParams).trim()
        const query = str(args.query).trim()
        if (!query) return JSON.stringify({ ok: false, error: 'query is required' })
        const header = headerParams ? `%%cribl_search ${headerParams}` : '%%cribl_search'
        const source = `${header}\n${query}\n`
        const parsed = parseCriblSearchMagic(source)
        if (parsed.kind === 'error') {
          return JSON.stringify({ ok: false, error: parsed.message })
        }
        if (parsed.kind === 'none') {
          return JSON.stringify({ ok: false, error: 'Invalid %%cribl_search cell' })
        }
        const { cellId, index } = appendCell(host, notebookTabId, 'code', source)
        return JSON.stringify({ ok: true, cellId, index, cell_type: 'code', magic: 'cribl_search' })
      }
      case 'create_api_cell': {
        const method = str(args.method).trim().toUpperCase() || 'GET'
        const path = str(args.path).trim()
        if (!path.startsWith('/')) {
          return JSON.stringify({ ok: false, error: 'path must start with /' })
        }
        const headerParams = str(args.headerParams).trim()
        const yamlBody = str(args.yamlBody).trim()
        const first = headerParams
          ? `%%cribl_api ${method} ${path} ${headerParams}`
          : `%%cribl_api ${method} ${path}`
        const source = yamlBody ? `${first}\n${yamlBody}\n` : `${first}\n`
        const parsed = parseCriblApiMagic(source)
        if (parsed.kind === 'error') {
          return JSON.stringify({ ok: false, error: parsed.message })
        }
        if (parsed.kind === 'none') {
          return JSON.stringify({ ok: false, error: 'Invalid %%cribl_api cell' })
        }
        const { cellId, index } = appendCell(host, notebookTabId, 'code', source)
        return JSON.stringify({ ok: true, cellId, index, cell_type: 'code', magic: 'cribl_api' })
      }
      case 'create_lookup_cell': {
        const operation = str(args.operation).trim().toLowerCase()
        const lookupFilename = str(args.lookupFilename).trim()
        const headerParams = str(args.headerParams).trim()
        if (!lookupFilename) {
          return JSON.stringify({ ok: false, error: 'lookupFilename is required' })
        }
        const magic =
          operation === 'save'
            ? '%%cribl_save_search_lookup'
            : operation === 'load'
              ? '%%cribl_load_search_lookup'
              : operation === 'delete'
                ? '%%cribl_delete_search_lookup'
                : null
        if (!magic) {
          return JSON.stringify({ ok: false, error: 'operation must be save, load, or delete' })
        }
        const rest = headerParams ? `${lookupFilename} ${headerParams}` : lookupFilename
        const source = `${magic} ${rest}\n`
        const parsed = parseCriblSearchLookupMagic(source)
        if (parsed.kind === 'error') {
          return JSON.stringify({ ok: false, error: parsed.message })
        }
        if (parsed.kind === 'none') {
          return JSON.stringify({ ok: false, error: 'Invalid lookup magic cell' })
        }
        const { cellId, index } = appendCell(host, notebookTabId, 'code', source)
        return JSON.stringify({
          ok: true,
          cellId,
          index,
          cell_type: 'code',
          magic: magic.replace(/^%%/, ''),
        })
      }
      default:
        return JSON.stringify({ ok: false, error: `Unknown tool: ${call.function.name}` })
    }
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

export function toolCallSummary(call: AgentToolCall, resultJson: string): string {
  let ok = false
  try {
    ok = Boolean((JSON.parse(resultJson) as { ok?: boolean }).ok)
  } catch {
    /* ignore */
  }
  const name = call.function.name
  if (!ok) return `Tool ${name} failed`
  switch (name) {
    case 'set_notebook_title':
      return 'Updated notebook title'
    case 'create_markdown_cell':
      return 'Created markdown cell'
    case 'create_python_cell':
      return 'Created Python cell'
    case 'create_search_cell':
      return 'Created search magic cell'
    case 'create_api_cell':
      return 'Created API magic cell'
    case 'create_lookup_cell':
      return 'Created lookup magic cell'
    default:
      return `Ran ${name}`
  }
}
