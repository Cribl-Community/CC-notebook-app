import type { NotebookState, NotebookAction, CodeCell, MarkdownCell, Cell } from '@features/notebook/model/types'
import { applyIOPub } from '@features/notebook/reducer/outputArea'

function makeCodeCell(): CodeCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'code',
    source: '',
    outputs: [],
    execution_count: null,
    execution_state: 'idle',
  }
}

function makeMarkdownCell(): MarkdownCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'markdown',
    source: '',
    editing: true,
  }
}

function duplicateCell(c: Cell): Cell {
  const id = crypto.randomUUID()
  if (c.cell_type === 'code') {
    return {
      ...c,
      id,
      outputs: [],
      execution_count: null,
      execution_state: 'idle',
      pendingClear: false,
    }
  }
  return { ...c, id }
}

export const initialState: NotebookState = {
  title: 'Untitled',
  cells: [makeCodeCell()],
  selectedId: null,
  executionCounter: 0,
  kernelStatus: 'loading',
}

/** Fresh code cell for a new in-memory notebook (new ids each call). */
export function createEmptyNotebookCells(): NotebookState['cells'] {
  return [makeCodeCell()]
}

export function notebookReducer(state: NotebookState, action: NotebookAction): NotebookState {
  switch (action.type) {
    case 'ADD_CELL': {
      const newCell: Cell =
        action.cellType === 'markdown' ? makeMarkdownCell() : makeCodeCell()
      if (!action.afterId) {
        return { ...state, cells: [...state.cells, newCell], selectedId: newCell.id }
      }
      const idx = state.cells.findIndex((c) => c.id === action.afterId)
      // Stale afterId (e.g. replaced notebook): append instead of splice(0, …), which would prepend.
      if (idx === -1) {
        return { ...state, cells: [...state.cells, newCell], selectedId: newCell.id }
      }
      const cells = [...state.cells]
      cells.splice(idx + 1, 0, newCell)
      return { ...state, cells, selectedId: newCell.id }
    }

    case 'DELETE_CELL': {
      if (state.cells.length === 1) return state
      const delIdx = state.cells.findIndex((c) => c.id === action.id)
      const cells = state.cells.filter((c) => c.id !== action.id)
      const selectedId =
        state.selectedId === action.id
          ? (cells[Math.min(delIdx, cells.length - 1)]?.id ?? null)
          : state.selectedId
      return { ...state, cells, selectedId }
    }

    case 'DUPLICATE_CELL': {
      const idx = state.cells.findIndex((c) => c.id === action.id)
      if (idx === -1) return state
      const cloned = duplicateCell(state.cells[idx]!)
      const cells = [...state.cells]
      cells.splice(idx + 1, 0, cloned)
      return { ...state, cells, selectedId: cloned.id }
    }

    case 'UPDATE_SOURCE':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id ? { ...c, source: action.source } : c,
        ),
      }

    case 'SELECT_CELL':
      return { ...state, selectedId: action.id }

    case 'TOGGLE_MARKDOWN_EDIT':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'markdown'
            ? { ...c, editing: !c.editing }
            : c,
        ),
      }

    case 'ENQUEUE_CELL':
      return {
        ...state,
        cells: state.cells.map((c): Cell => {
          if (c.id !== action.id || c.cell_type !== 'code') return c
          if (c.execution_state !== 'idle') return c
          return { ...c, execution_state: 'pending' }
        }),
      }

    case 'CLEAR_ALL_PENDING':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.cell_type === 'code' && c.execution_state === 'pending'
            ? { ...c, execution_state: 'idle' }
            : c,
        ),
      }

    case 'SET_RUNNING':
      return {
        ...state,
        cells: state.cells.map((c): Cell => {
          if (c.id !== action.id || c.cell_type !== 'code') return c
          const updated: CodeCell = {
            ...c,
            execution_state: 'running',
            outputs: [],
            execution_count: null,
            pendingClear: false,
          }
          return updated
        }),
      }

    case 'APPEND_OUTPUT':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? { ...c, outputs: [...c.outputs, action.output] }
            : c,
        ),
      }

    case 'REPLACE_OUTPUT_AT': {
      const { index, output } = action
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? (() => {
                const next = [...c.outputs]
                if (index >= 0 && index < next.length) {
                  next[index] = output
                  return { ...c, outputs: next }
                }
                return c
              })()
            : c,
        ),
      }
    }

    case 'IOPUB': {
      return {
        ...state,
        cells: state.cells.map((c): Cell => {
          if (c.id !== action.id || c.cell_type !== 'code') return c
          const area = { records: c.outputs, pendingClear: c.pendingClear ?? false }
          const next = applyIOPub(area, action.msg)
          if (next.records === area.records && next.pendingClear === area.pendingClear) {
            return c
          }
          return { ...c, outputs: next.records, pendingClear: next.pendingClear }
        }),
      }
    }

    case 'FINISH_CELL':
      return {
        ...state,
        executionCounter: action.execution_count,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? { ...c, execution_state: 'idle', execution_count: action.execution_count }
            : c,
        ),
      }

    case 'ERROR_CELL':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? { ...c, execution_state: 'idle' }
            : c,
        ),
      }

    case 'CLEAR_OUTPUTS':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? { ...c, outputs: [], execution_count: null, pendingClear: false }
            : c,
        ),
      }

    case 'CLEAR_ALL_OUTPUTS':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.cell_type === 'code'
            ? { ...c, outputs: [], execution_count: null, pendingClear: false }
            : c,
        ),
      }

    case 'MOVE_CELL': {
      const idx = state.cells.findIndex((c) => c.id === action.id)
      if (idx === -1) return state
      if (action.direction === 'up' && idx === 0) return state
      if (action.direction === 'down' && idx === state.cells.length - 1) return state
      const cells = [...state.cells]
      const swapIdx = action.direction === 'up' ? idx - 1 : idx + 1
      ;[cells[idx], cells[swapIdx]] = [cells[swapIdx], cells[idx]]
      return { ...state, cells }
    }

    case 'SET_KERNEL_STATUS':
      return { ...state, kernelStatus: action.status }

    case 'RESTART':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.cell_type === 'code'
            ? {
                ...c,
                outputs: [],
                execution_count: null,
                execution_state: 'idle',
                pendingClear: false,
              }
            : c,
        ),
        executionCounter: 0,
        kernelStatus: 'loading',
      }

    case 'SET_NOTEBOOK_TITLE': {
      const t = action.title.trim()
      return { ...state, title: t.length > 0 ? t : 'Untitled' }
    }

    case 'LOAD_NOTEBOOK': {
      const cells = action.cells.length > 0 ? action.cells : [makeCodeCell()]
      const title = action.title.trim()
      return {
        ...state,
        title: title.length > 0 ? title : 'Untitled',
        cells,
        selectedId: cells[0]?.id ?? null,
        executionCounter: 0,
      }
    }

    default:
      return state
  }
}
