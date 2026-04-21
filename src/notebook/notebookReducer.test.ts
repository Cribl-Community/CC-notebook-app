import { describe, it, expect } from 'vitest'
import { notebookReducer, createEmptyNotebookCells } from './notebookReducer'
import type { Cell, NotebookState } from './types'

function readyStateFromCells(cells: NotebookState['cells']): NotebookState {
  return {
    title: 't',
    cells,
    selectedId: cells[0]?.id ?? null,
    executionCounter: 0,
    kernelStatus: 'ready',
  }
}

describe('notebookReducer execution queue', () => {
  it('ENQUEUE_CELL sets idle code cell to pending', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ENQUEUE_CELL', id })
    const c = state.cells.find((x) => x.id === id)
    expect(c?.cell_type === 'code' && c.execution_state).toBe('pending')
  })

  it('ENQUEUE_CELL is a no-op for non-idle code cells', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ENQUEUE_CELL', id })
    const pending = state.cells
    state = notebookReducer(state, { type: 'ENQUEUE_CELL', id })
    expect(state.cells).toEqual(pending)
  })

  it('CLEAR_ALL_PENDING resets pending cells to idle', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ENQUEUE_CELL', id })
    expect(state.cells[0]?.cell_type === 'code' && state.cells[0].execution_state).toBe('pending')
    state = notebookReducer(state, { type: 'CLEAR_ALL_PENDING' })
    expect(state.cells[0]?.cell_type === 'code' && state.cells[0].execution_state).toBe('idle')
  })

  it('SET_RUNNING promotes pending to running and clears outputs', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const withOut: NotebookState['cells'] = cells.map((c) =>
      c.id === id && c.cell_type === 'code'
        ? { ...c, outputs: [{ output_type: 'stream', name: 'stdout', text: 'x' }], execution_state: 'pending' }
        : c,
    )
    let state = readyStateFromCells(withOut)
    state = notebookReducer(state, { type: 'SET_RUNNING', id })
    const c = state.cells.find((x) => x.id === id)
    expect(c?.cell_type === 'code' && c.execution_state).toBe('running')
    expect(c?.cell_type === 'code' && c.outputs.length).toBe(0)
  })
})

describe('notebookReducer DUPLICATE_CELL', () => {
  it('inserts a copy below the source code cell with fresh execution fields', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const withSrc = cells.map((c) =>
      c.id === id && c.cell_type === 'code'
        ? {
            ...c,
            source: 'print(1)',
            outputs: [{ output_type: 'stream' as const, name: 'stdout' as const, text: '1\n' }],
            execution_count: 3,
            execution_state: 'idle' as const,
          }
        : c,
    )
    let state = readyStateFromCells(withSrc)
    state = notebookReducer(state, { type: 'DUPLICATE_CELL', id })
    expect(state.cells.length).toBe(2)
    expect(state.cells[0]?.id).toBe(id)
    const clone = state.cells[1]
    expect(clone?.cell_type).toBe('code')
    if (clone?.cell_type !== 'code') throw new Error('expected code')
    expect(clone.source).toBe('print(1)')
    expect(clone.outputs).toEqual([])
    expect(clone.execution_count).toBeNull()
    expect(clone.execution_state).toBe('idle')
    expect(clone.id).not.toBe(id)
    expect(state.selectedId).toBe(clone.id)
  })

  it('duplicates markdown preserving editing flag', () => {
    const id = 'md-1'
    const cells: Cell[] = [
      {
        id,
        cell_type: 'markdown',
        source: '# Hi',
        editing: false,
      },
    ]
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'DUPLICATE_CELL', id })
    expect(state.cells.length).toBe(2)
    const clone = state.cells[1]
    expect(clone?.cell_type).toBe('markdown')
    if (clone?.cell_type !== 'markdown') throw new Error('expected markdown')
    expect(clone.source).toBe('# Hi')
    expect(clone.editing).toBe(false)
    expect(clone.id).not.toBe(id)
  })

  it('is a no-op for unknown id', () => {
    const cells = createEmptyNotebookCells()
    const state = readyStateFromCells(cells)
    const same = notebookReducer(state, { type: 'DUPLICATE_CELL', id: 'missing' })
    expect(same).toEqual(state)
  })
})
