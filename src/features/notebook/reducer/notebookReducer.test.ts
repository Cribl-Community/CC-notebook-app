import { describe, it, expect } from 'vitest'
import { notebookReducer, createEmptyNotebookCells } from '@features/notebook/reducer/notebookReducer'
import type { Cell, NotebookState } from '@features/notebook/model/types'

function readyStateFromCells(cells: NotebookState['cells']): NotebookState {
  return {
    title: 't',
    cells,
    selectedId: cells[0]?.id ?? null,
    executionCounter: 0,
    kernelStatus: 'ready',
    kernelInit: {
      phase: 'ready',
      message: 'Python kernel ready',
      progressPercent: 100,
      startedAtMs: null,
      errorSummary: null,
      errorDetail: null,
    },
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

  it('copies codeFolded onto duplicate', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const long = [...Array(11)].map((_, i) => `x(${i})`).join('\n')
    const withFold = cells.map((c) =>
      c.id === id && c.cell_type === 'code' ? { ...c, source: long, codeFolded: true as const } : c,
    )
    let state = readyStateFromCells(withFold)
    state = notebookReducer(state, { type: 'DUPLICATE_CELL', id })
    const clone = state.cells[1]
    expect(clone?.cell_type === 'code' && clone.codeFolded).toBe(true)
  })
})

describe('notebookReducer cell enable / condition / skip', () => {
  it('SET_CELL_ENABLED toggles and clears conditionOutcome', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const withOutcome = cells.map((c) =>
      c.id === id && c.cell_type === 'code' ? { ...c, conditionOutcome: 'true' as const } : c,
    )
    let state = readyStateFromCells(withOutcome)
    state = notebookReducer(state, { type: 'SET_CELL_ENABLED', id, enabled: false })
    const c = state.cells[0]
    expect(c?.cell_type === 'code' && c.enabled === false).toBe(true)
    expect(c?.cell_type === 'code' && c.conditionOutcome).toBeNull()
  })

  it('SKIP_CELL_TO_IDLE clears pending only', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const pending = cells.map((c) =>
      c.id === id && c.cell_type === 'code' ? { ...c, execution_state: 'pending' as const } : c,
    )
    let state = readyStateFromCells(pending)
    state = notebookReducer(state, { type: 'SKIP_CELL_TO_IDLE', id })
    expect(state.cells[0]?.cell_type === 'code' && state.cells[0].execution_state).toBe('idle')
  })

  it('DUPLICATE_CELL copies enabled and runCondition and clears conditionOutcome', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const src = cells.map((c) =>
      c.id === id && c.cell_type === 'code'
        ? {
            ...c,
            source: 'x',
            enabled: false,
            runCondition: 'False',
            conditionOutcome: 'false' as const,
          }
        : c,
    )
    let state = readyStateFromCells(src)
    state = notebookReducer(state, { type: 'DUPLICATE_CELL', id })
    const clone = state.cells[1]
    expect(clone?.cell_type === 'code' && clone.enabled).toBe(false)
    expect(clone?.cell_type === 'code' && clone.runCondition).toBe('False')
    expect(clone?.cell_type === 'code' && clone.conditionOutcome).toBeNull()
  })

  it('UPDATE_SOURCE clears conditionOutcome', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const withOutcome = cells.map((c) =>
      c.id === id && c.cell_type === 'code' ? { ...c, conditionOutcome: 'true' as const } : c,
    )
    let state = readyStateFromCells(withOutcome)
    state = notebookReducer(state, { type: 'UPDATE_SOURCE', id, source: 'print(2)' })
    expect(state.cells[0]?.cell_type === 'code' && state.cells[0].conditionOutcome).toBeNull()
  })
})

describe('notebookReducer SET_CODE_FOLDED', () => {
  it('sets codeFolded on the targeted code cell', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'SET_CODE_FOLDED', id, folded: true })
    const c = state.cells[0]
    expect(c?.cell_type === 'code' && c.codeFolded).toBe(true)
    state = notebookReducer(state, { type: 'SET_CODE_FOLDED', id, folded: false })
    expect(state.cells[0]?.cell_type === 'code' && state.cells[0].codeFolded).toBe(false)
  })
})

describe('notebookReducer UPDATE_SOURCE', () => {
  it('clears codeFolded when source becomes short', () => {
    const cells = createEmptyNotebookCells()
    const id = cells[0]!.id
    const long = [...Array(11)].map((_, i) => `x(${i})`).join('\n')
    const withFold = cells.map((c) =>
      c.id === id && c.cell_type === 'code' ? { ...c, source: long, codeFolded: true as const } : c,
    )
    let state = readyStateFromCells(withFold)
    state = notebookReducer(state, { type: 'UPDATE_SOURCE', id, source: 'short' })
    const c = state.cells[0]
    expect(c?.cell_type === 'code' && c.codeFolded).toBe(false)
  })
})

describe('notebookReducer ADD_CELL', () => {
  it('appends when afterId is omitted', () => {
    const cells = createEmptyNotebookCells()
    const id0 = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ADD_CELL', cellType: 'markdown' })
    expect(state.cells.length).toBe(2)
    expect(state.cells[1]?.cell_type).toBe('markdown')
    expect(state.selectedId).toBe(state.cells[1]?.id)
    expect(state.cells[0]?.id).toBe(id0)
  })

  it('inserts below afterId when that cell exists', () => {
    const cells = createEmptyNotebookCells()
    const id0 = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ADD_CELL', afterId: id0, cellType: 'markdown' })
    expect(state.cells.length).toBe(2)
    expect(state.cells[0]?.id).toBe(id0)
    expect(state.cells[1]?.cell_type).toBe('markdown')
    expect(state.selectedId).toBe(state.cells[1]?.id)
  })

  it('appends when afterId does not exist (stale id)', () => {
    const cells = createEmptyNotebookCells()
    const id0 = cells[0]!.id
    let state = readyStateFromCells(cells)
    state = notebookReducer(state, { type: 'ADD_CELL', afterId: 'nonexistent-cell-id', cellType: 'code' })
    expect(state.cells.length).toBe(2)
    expect(state.cells[0]?.id).toBe(id0)
    const added = state.cells[1]
    expect(added?.cell_type).toBe('code')
    expect(state.selectedId).toBe(added?.id)
  })

  it('uses stable id and source when provided (double-apply safe)', () => {
    const cells = createEmptyNotebookCells()
    const state = readyStateFromCells(cells)
    const action = {
      type: 'ADD_CELL' as const,
      cellType: 'code' as const,
      id: 'fixed-cell-id',
      source: 'print(1)',
    }
    const a = notebookReducer(state, action)
    const b = notebookReducer(state, action)
    expect(a.cells[1]?.id).toBe('fixed-cell-id')
    expect(a.cells[1]?.source).toBe('print(1)')
    expect(b.cells[1]?.id).toBe(a.cells[1]?.id)
    expect(b.cells[1]?.source).toBe(a.cells[1]?.source)
  })
})

describe('notebookReducer kernel init lifecycle', () => {
  it('updates kernel init progress from lifecycle actions', () => {
    const state = notebookReducer(readyStateFromCells(createEmptyNotebookCells()), {
      type: 'SET_KERNEL_INIT_PROGRESS',
      phase: 'runtime',
      message: 'Loading Python runtime',
      progressPercent: 45,
    })
    expect(state.kernelInit.phase).toBe('runtime')
    expect(state.kernelInit.message).toBe('Loading Python runtime')
    expect(state.kernelInit.progressPercent).toBe(45)
    expect(state.kernelInit.errorSummary).toBeNull()
  })

  it('stores startup error details for banner display', () => {
    const state = notebookReducer(readyStateFromCells(createEmptyNotebookCells()), {
      type: 'SET_KERNEL_INIT_ERROR',
      summary: 'Import failed',
      detail: 'stack trace',
    })
    expect(state.kernelInit.phase).toBe('error')
    expect(state.kernelInit.errorSummary).toBe('Import failed')
    expect(state.kernelInit.errorDetail).toBe('stack trace')
  })
})
