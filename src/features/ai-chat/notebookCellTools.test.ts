import { describe, expect, it } from 'vitest'
import {
  createChatTab,
  createInitialWorkspace,
  tabWorkspaceReducer,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import { executeNotebookTool, syncWorkspaceDispatch } from '@features/ai-chat/notebookCellTools'

function hostWithChat() {
  let state: WorkspaceState = createInitialWorkspace()
  const chat = createChatTab()
  state = tabWorkspaceReducer(state, { type: 'ADD_TAB', tab: chat })
  const workspaceRef = { current: state }
  const dispatch = syncWorkspaceDispatch(workspaceRef, (action) => {
    state = tabWorkspaceReducer(state, action)
    workspaceRef.current = state
  })
  return { workspaceRef, dispatch, chatTabId: chat.id, getState: () => workspaceRef.current }
}

describe('executeNotebookTool', () => {
  it('creates a linked notebook and python cell', () => {
    const host = hostWithChat()
    const result = JSON.parse(
      executeNotebookTool(host, {
        id: 'c1',
        function: { name: 'create_python_cell', arguments: '{"source":"print(1)"}' },
      }),
    ) as { ok: boolean; cellId: string }
    expect(result.ok).toBe(true)
    const chat = host.getState().tabs.find((t) => t.id === host.chatTabId)
    expect(chat?.linkedNotebookTabId).toBeTruthy()
    const nb = host.getState().tabs.find((t) => t.id === chat?.linkedNotebookTabId)
    expect(nb?.notebook.cells.some((c) => c.cell_type === 'code' && c.source.includes('print(1)'))).toBe(
      true,
    )
    // Chat remains selected
    expect(host.getState().activeTabId).toBe(host.chatTabId)
  })

  it('creates a search magic cell', () => {
    const host = hostWithChat()
    const result = JSON.parse(
      executeNotebookTool(host, {
        id: 'c2',
        function: {
          name: 'create_search_cell',
          arguments: JSON.stringify({
            headerParams: 'var=df dataset=cribl_search_sample',
            query: 'dataset=cribl_search_sample | limit 10',
          }),
        },
      }),
    ) as { ok: boolean; cellId: string }
    expect(result.ok).toBe(true)
    const chat = host.getState().tabs.find((t) => t.id === host.chatTabId)
    const nb = host.getState().tabs.find((t) => t.id === chat?.linkedNotebookTabId)
    const src = nb?.notebook.cells.find((c) => c.id === result.cellId)?.source ?? ''
    expect(src).toMatch(/^%%cribl_search/)
    expect(src).toContain('limit 10')
  })

  it('rejects invalid api path', () => {
    const host = hostWithChat()
    const result = JSON.parse(
      executeNotebookTool(host, {
        id: 'c3',
        function: {
          name: 'create_api_cell',
          arguments: JSON.stringify({ method: 'GET', path: 'system/info' }),
        },
      }),
    ) as { ok: boolean; error?: string }
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/path must start/)
  })
})
