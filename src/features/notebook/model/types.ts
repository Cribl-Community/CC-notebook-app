import type { CellOutput, IOPubMessage, OutputRecord } from '@platform/pyodide/types'

export type { CellOutput, IOPubMessage, OutputRecord }

export type CellId = string

export type ExecutionState = 'idle' | 'pending' | 'running'

export interface CodeCell {
  id: CellId
  cell_type: 'code'
  source: string
  outputs: OutputRecord[]
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
  /** Display name without extension; used for download filename. */
  title: string
  cells: Cell[]
  selectedId: CellId | null
  executionCounter: number
  kernelStatus: KernelStatus
}

export type NotebookAction =
  | { type: 'ADD_CELL'; afterId?: CellId; cellType?: 'code' | 'markdown' }
  | { type: 'DELETE_CELL'; id: CellId }
  | { type: 'DUPLICATE_CELL'; id: CellId }
  | { type: 'UPDATE_SOURCE'; id: CellId; source: string }
  | { type: 'SELECT_CELL'; id: CellId }
  | { type: 'TOGGLE_MARKDOWN_EDIT'; id: CellId }
  | { type: 'ENQUEUE_CELL'; id: CellId }
  | { type: 'CLEAR_ALL_PENDING' }
  | { type: 'SET_RUNNING'; id: CellId }
  | { type: 'APPEND_OUTPUT'; id: CellId; output: OutputRecord }
  | { type: 'REPLACE_OUTPUT_AT'; id: CellId; index: number; output: OutputRecord }
  | { type: 'IOPUB'; id: CellId; msg: IOPubMessage; executionCount: number | null }
  | { type: 'FINISH_CELL'; id: CellId; execution_count: number }
  | { type: 'ERROR_CELL'; id: CellId }
  | { type: 'CLEAR_OUTPUTS'; id: CellId }
  | { type: 'CLEAR_ALL_OUTPUTS' }
  | { type: 'SET_KERNEL_STATUS'; status: KernelStatus }
  | { type: 'MOVE_CELL'; id: CellId; direction: 'up' | 'down' }
  | { type: 'RESTART' }
  | { type: 'SET_NOTEBOOK_TITLE'; title: string }
  | { type: 'LOAD_NOTEBOOK'; title: string; cells: Cell[] }
