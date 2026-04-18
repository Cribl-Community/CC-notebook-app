import type { CellOutput } from '../pyodide/types'

export type { CellOutput }

export type CellId = string

export type ExecutionState = 'idle' | 'pending' | 'running'

export interface CodeCell {
  id: CellId
  cell_type: 'code'
  source: string
  outputs: CellOutput[]
  execution_count: number | null
  execution_state: ExecutionState
}

export interface MarkdownCell {
  id: CellId
  cell_type: 'markdown'
  source: string
  editing: boolean
}

export type Cell = CodeCell | MarkdownCell

export type KernelStatus = 'loading' | 'ready' | 'busy' | 'error'

export interface NotebookState {
  cells: Cell[]
  selectedId: CellId | null
  executionCounter: number
  kernelStatus: KernelStatus
}

export type NotebookAction =
  | { type: 'ADD_CELL'; afterId?: CellId; cellType?: 'code' | 'markdown' }
  | { type: 'DELETE_CELL'; id: CellId }
  | { type: 'UPDATE_SOURCE'; id: CellId; source: string }
  | { type: 'SELECT_CELL'; id: CellId }
  | { type: 'TOGGLE_MARKDOWN_EDIT'; id: CellId }
  | { type: 'SET_RUNNING'; id: CellId }
  | { type: 'APPEND_OUTPUT'; id: CellId; output: CellOutput }
  | { type: 'FINISH_CELL'; id: CellId; execution_count: number }
  | { type: 'ERROR_CELL'; id: CellId }
  | { type: 'CLEAR_OUTPUTS'; id: CellId }
  | { type: 'SET_KERNEL_STATUS'; status: KernelStatus }
  | { type: 'RESTART' }
