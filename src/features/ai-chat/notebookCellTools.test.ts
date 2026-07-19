import { describe, expect, it } from 'vitest'
import {
  createEmptyTab,
  createInitialWorkspace,
  tabWorkspaceReducer,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import { executeNotebookTool, syncWorkspaceDispatch } from '@features/ai-chat/notebookCellTools'

/** Mirrors production: sync wrapper updates ref immediately; React applies the same action separately. */
function hostFrom(initial: WorkspaceState) {
  let reactState = initial
  const workspaceRef = { current: reactState }
  const dispatch = syncWorkspaceDispatch(workspaceRef, (action) => {
    reactState = tabWorkspaceReducer(reactState, action)
  })
  return {
    workspaceRef,
    dispatch,
    getState: () => workspaceRef.current,
    getReactState: () => reactState,
  }
}

function hostWithWelcome() {
  return hostFrom(createInitialWorkspace())
}

function hostWithNotebook() {
  let state = createInitialWorkspace()
  const nb = createEmptyTab()
  state = tabWorkspaceReducer(state, { type: 'ADD_TAB', tab: nb })
  return { ...hostFrom(state), notebookTabId: nb.id }
}

describe('executeNotebookTool', () => {
  it('creates a notebook from Welcome and adds a python cell', () => {
    const host = hostWithWelcome()
    const result = JSON.parse(
      executeNotebookTool(host, {
        id: 'c1',
        function: { name: 'create_python_cell', arguments: '{"source":"print(1)"}' },
      }),
    ) as { ok: boolean; cellId: string }
    expect(result.ok).toBe(true)
    const active = host.getState().tabs.find((t) => t.id === host.getState().activeTabId)
    expect(active?.kind).toBe('notebook')
    expect(active?.notebook.cells.some((c) => c.source.includes('print(1)'))).toBe(true)
  })

  it('writes into the active notebook', () => {
    const host = hostWithNotebook()
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
    expect(host.getState().activeTabId).toBe(host.notebookTabId)
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    const src = nb?.notebook.cells.find((c) => c.id === result.cellId)?.source ?? ''
    expect(src).toMatch(/^%%cribl_search/)
    expect(src).toContain('limit 10')
  })

  it('inserts after the selected cell', () => {
    const host = hostWithNotebook()
    executeNotebookTool(host, {
      id: 'a',
      function: { name: 'create_python_cell', arguments: '{"source":"a=1"}' },
    })
    executeNotebookTool(host, {
      id: 'b',
      function: { name: 'create_python_cell', arguments: '{"source":"b=2"}' },
    })
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)!
    const firstId = nb.notebook.cells[0]!.id
    host.dispatch({
      type: 'TAB_NOTEBOOK',
      tabId: host.notebookTabId,
      action: { type: 'SELECT_CELL', id: firstId },
    })
    executeNotebookTool(host, {
      id: 'mid',
      function: { name: 'create_python_cell', arguments: '{"source":"mid=3"}' },
    })
    const cells = host.getState().tabs.find((t) => t.id === host.notebookTabId)!.notebook.cells
    expect(cells.map((c) => c.source)).toEqual(['a=1', 'mid=3', 'b=2'])
  })

  it('keeps React state in sync when adding markdown then code (double-apply)', () => {
    const host = hostWithNotebook()
    executeNotebookTool(host, {
      id: 'm1',
      function: {
        name: 'create_markdown_cell',
        arguments: JSON.stringify({ source: '# Hits' }),
      },
    })
    executeNotebookTool(host, {
      id: 'p1',
      function: {
        name: 'create_python_cell',
        arguments: JSON.stringify({ source: 'print(df)' }),
      },
    })
    const refNb = host.getState().tabs.find((t) => t.id === host.notebookTabId)?.notebook
    const reactNb = host.getReactState().tabs.find((t) => t.id === host.notebookTabId)?.notebook
    expect(reactNb?.cells.map((c) => ({ id: c.id, source: c.source }))).toEqual(
      refNb?.cells.map((c) => ({ id: c.id, source: c.source })),
    )
    expect(reactNb?.cells.some((c) => c.source.includes('# Hits'))).toBe(true)
    expect(reactNb?.cells.some((c) => c.source.includes('print(df)'))).toBe(true)
  })

  it('rejects invalid api path', () => {
    const host = hostWithWelcome()
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
