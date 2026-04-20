import { describe, it, expect } from 'vitest'
import { notebookReducer, createEmptyNotebookCells } from './notebookReducer'
import type { NotebookState } from './types'

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
