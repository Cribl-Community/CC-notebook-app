import { describe, expect, it } from 'vitest'
import {
  createEmptyTab,
  createInitialWorkspace,
  tabWorkspaceReducer,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import {
  executeNotebookTool,
  syncWorkspaceDispatch,
  toolCallSummary,
} from '@features/ai-chat/notebookCellTools'

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

function parseResult(json: string) {
  return JSON.parse(json) as { ok: boolean; cellId?: string; error?: string; title?: string }
}

describe('executeNotebookTool', () => {
  it('creates a notebook from Welcome and adds a python cell', () => {
    const host = hostWithWelcome()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'c1',
        function: { name: 'create_python_cell', arguments: '{"source":"print(1)"}' },
      }),
    )
    expect(result.ok).toBe(true)
    const active = host.getState().tabs.find((t) => t.id === host.getState().activeTabId)
    expect(active?.kind).toBe('notebook')
    expect(active?.notebook.cells.some((c) => c.source.includes('print(1)'))).toBe(true)
  })

  it('sets the notebook title', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 't1',
        function: { name: 'set_notebook_title', arguments: '{"title":"Hunt"}' },
      }),
    )
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Hunt')
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    expect(nb?.notebook.title).toBe('Hunt')
  })

  it('creates a markdown cell', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'm1',
        function: { name: 'create_markdown_cell', arguments: '{"source":"# Intro"}' },
      }),
    )
    expect(result.ok).toBe(true)
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    const cell = nb?.notebook.cells.find((c) => c.id === result.cellId)
    expect(cell?.cell_type).toBe('markdown')
    expect(cell?.source).toContain('# Intro')
  })

  it('rejects python cells that contain cribl magics', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'bad',
        function: {
          name: 'create_python_cell',
          arguments: JSON.stringify({ source: '%%cribl_search\ndataset=x' }),
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/create_search_cell/)
  })

  it('writes a search cell into the active notebook', () => {
    const host = hostWithNotebook()
    const result = parseResult(
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
    )
    expect(result.ok).toBe(true)
    expect(host.getState().activeTabId).toBe(host.notebookTabId)
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    const src = nb?.notebook.cells.find((c) => c.id === result.cellId)?.source ?? ''
    expect(src).toMatch(/^%%cribl_search/)
    expect(src).toContain('limit 10')
  })

  it('creates a valid api cell', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'api',
        function: {
          name: 'create_api_cell',
          arguments: JSON.stringify({ method: 'GET', path: '/system/info', headerParams: 'var=info' }),
        },
      }),
    )
    expect(result.ok).toBe(true)
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    const src = nb?.notebook.cells.find((c) => c.id === result.cellId)?.source ?? ''
    expect(src).toMatch(/^%%cribl_api GET \/system\/info/)
  })

  it('rejects invalid api path', () => {
    const host = hostWithWelcome()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'c3',
        function: {
          name: 'create_api_cell',
          arguments: JSON.stringify({ method: 'GET', path: 'system/info' }),
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/path must start/)
  })

  it.each([
    ['save', '%%cribl_save_search_lookup'],
    ['load', '%%cribl_load_search_lookup'],
    ['delete', '%%cribl_delete_search_lookup'],
  ] as const)('creates a lookup %s cell', (operation, magic) => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: `lk_${operation}`,
        function: {
          name: 'create_lookup_cell',
          arguments: JSON.stringify({
            operation,
            lookupFilename: 'my_table.csv',
            headerParams: operation === 'delete' ? '' : 'var=df',
          }),
        },
      }),
    )
    expect(result.ok).toBe(true)
    const nb = host.getState().tabs.find((t) => t.id === host.notebookTabId)
    const src = nb?.notebook.cells.find((c) => c.id === result.cellId)?.source ?? ''
    expect(src.startsWith(magic)).toBe(true)
    expect(src).toContain('my_table.csv')
  })

  it('rejects invalid lookup operation', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'lk_bad',
        function: {
          name: 'create_lookup_cell',
          arguments: JSON.stringify({ operation: 'merge', lookupFilename: 'x.csv' }),
        },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/operation must be/)
  })

  it('rejects unknown tools', () => {
    const host = hostWithNotebook()
    const result = parseResult(
      executeNotebookTool(host, {
        id: 'u',
        function: { name: 'delete_everything', arguments: '{}' },
      }),
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/Unknown tool/)
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
})

describe('toolCallSummary', () => {
  it('summarizes successful and failed tool results', () => {
    const call = {
      id: '1',
      function: { name: 'create_search_cell', arguments: '{}' },
    }
    expect(toolCallSummary(call, '{"ok":true}')).toBe('Created search magic cell')
    expect(toolCallSummary(call, '{"ok":false}')).toBe('Tool create_search_cell failed')
  })
})
