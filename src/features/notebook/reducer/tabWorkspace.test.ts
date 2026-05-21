import { describe, expect, it } from 'vitest'
import { notebookReducer } from '@features/notebook/reducer/notebookReducer'
import {
  createEmptyTab,
  createInitialWorkspace,
  createWelcomeTab,
  tabIsDirty,
  tabWorkspaceReducer,
} from '@features/notebook/reducer/tabWorkspace'
import { serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'
import type { Cell } from '@features/notebook/model/types'

describe('tabWorkspaceReducer', () => {
  it('ADD_TAB appends and selects new tab', () => {
    const s0 = createInitialWorkspace()
    expect(s0.tabs[0].kind).toBe('welcome')
    const t2 = createEmptyTab()
    const s1 = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    expect(s1.tabs).toHaveLength(2)
    expect(s1.activeTabId).toBe(t2.id)
  })

  it('TAB_NOTEBOOK only updates the targeted tab', () => {
    const s0 = createInitialWorkspace()
    const t2 = createEmptyTab()
    const s1 = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    const title0 = s1.tabs[0].notebook.title
    const s2 = tabWorkspaceReducer(s1, {
      type: 'TAB_NOTEBOOK',
      tabId: t2.id,
      action: { type: 'SET_NOTEBOOK_TITLE', title: 'Other' },
    })
    expect(s2.tabs[0].notebook.title).toBe(title0)
    expect(s2.tabs[1].notebook.title).toBe('Other')
  })

  it('TAB_NOTEBOOK does not mutate welcome tab', () => {
    const s0 = createInitialWorkspace()
    const wId = s0.tabs[0].id
    const s1 = tabWorkspaceReducer(s0, {
      type: 'TAB_NOTEBOOK',
      tabId: wId,
      action: { type: 'SET_NOTEBOOK_TITLE', title: 'Nope' },
    })
    expect(s1.tabs[0].notebook.title).toBe('Welcome')
  })

  it('CLOSE_TAB removes tab and selects another', () => {
    const s0 = createInitialWorkspace()
    const a = s0.tabs[0].id
    const t2 = createEmptyTab()
    const s1 = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    expect(s1.activeTabId).toBe(t2.id)
    const s2 = tabWorkspaceReducer(s1, { type: 'CLOSE_TAB', tabId: t2.id })
    expect(s2.tabs).toHaveLength(1)
    expect(s2.activeTabId).toBe(a)
  })

  it('REPLACE_TAB_CONTENT sets lastSavedJson in sync with notebook', () => {
    const s0 = createInitialWorkspace()
    const t2 = createEmptyTab()
    const s0b = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    const tabId = s0b.tabs[1].id
    const cells = s0b.tabs[1].notebook.cells
    const s1 = tabWorkspaceReducer(s0b, {
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title: 'Hello',
      cells,
      kvNotebookId: 'kv-1',
    })
    const t = s1.tabs[1]
    expect(t.kvNotebookId).toBe('kv-1')
    expect(t.lastSavedJson).toBe(serializeNotebookToIpynbJson(t.notebook))
    expect(tabIsDirty(t)).toBe(false)
  })

  it('REPLACE_TAB_CONTENT with collapseLongCodeCellsOnOpen folds long non-Riptide cells', () => {
    const s0 = createInitialWorkspace()
    const t2 = createEmptyTab()
    const s0b = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    const tabId = s0b.tabs[1].id
    const long = [...Array(11)].map((_, i) => `print(${i})`).join('\n')
    const cells: Cell[] = [
      {
        id: 'c1',
        cell_type: 'code',
        source: long,
        outputs: [],
        execution_count: null,
        execution_state: 'idle',
      },
    ]
    const s1 = tabWorkspaceReducer(s0b, {
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title: 'Ex',
      cells,
      kvNotebookId: null,
      collapseLongCodeCellsOnOpen: true,
    })
    const c = s1.tabs[1].notebook.cells[0]
    expect(c?.cell_type === 'code' && c.codeFolded).toBe(true)
  })

  it('REPLACE_TAB_CONTENT example defaults do not override explicit codeFolded from file', () => {
    const s0 = createInitialWorkspace()
    const t2 = createEmptyTab()
    const s0b = tabWorkspaceReducer(s0, { type: 'ADD_TAB', tab: t2 })
    const tabId = s0b.tabs[1].id
    const long = [...Array(11)].map((_, i) => `print(${i})`).join('\n')
    const cells: Cell[] = [
      {
        id: 'c1',
        cell_type: 'code',
        source: long,
        outputs: [],
        execution_count: null,
        execution_state: 'idle',
        codeFolded: false,
      },
    ]
    const s1 = tabWorkspaceReducer(s0b, {
      type: 'REPLACE_TAB_CONTENT',
      tabId,
      title: 'Ex',
      cells,
      kvNotebookId: null,
      collapseLongCodeCellsOnOpen: true,
    })
    const c = s1.tabs[1].notebook.cells[0]
    expect(c?.cell_type === 'code' && c.codeFolded).toBe(false)
  })
})

describe('tabIsDirty', () => {
  it('detects unsaved edits', () => {
    const tab = createEmptyTab()
    const s1 = notebookReducer(tab.notebook, { type: 'SET_NOTEBOOK_TITLE', title: 'X' })
    const dirty = { ...tab, notebook: s1 }
    expect(tabIsDirty(dirty)).toBe(true)
  })

  it('welcome tab is never dirty', () => {
    const w = createWelcomeTab()
    const mutated = notebookReducer(w.notebook, { type: 'SET_NOTEBOOK_TITLE', title: 'X' })
    expect(tabIsDirty({ ...w, notebook: mutated })).toBe(false)
  })
})
