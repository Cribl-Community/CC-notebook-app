import type { NotebookState, NotebookAction, CodeCell, MarkdownCell, Cell } from './types'

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

export const initialState: NotebookState = {
  title: 'Untitled',
  cells: [makeCodeCell()],
  selectedId: null,
  executionCounter: 0,
  kernelStatus: 'loading',
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

    case 'SET_RUNNING':
      return {
        ...state,
        cells: state.cells.map((c): Cell =>
          c.id === action.id && c.cell_type === 'code'
            ? { ...c, execution_state: 'running', outputs: [], execution_count: null }
            : c,
        ),
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
            ? { ...c, outputs: [], execution_count: null }
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
            ? { ...c, outputs: [], execution_count: null, execution_state: 'idle' }
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
