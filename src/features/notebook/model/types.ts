import type { CellOutput, IOPubMessage, OutputRecord } from '@/domain/kernel'

export type { CellOutput, IOPubMessage, OutputRecord }

export type CellId = string

export type ExecutionState = 'idle' | 'pending' | 'running'

/** Result of evaluating `runCondition` after a run attempt (not serialised). */
export type CellConditionOutcome = 'true' | 'false' | 'error'

export interface CodeCell {
  id: CellId
  cell_type: 'code'
  source: string
  outputs: OutputRecord[]
  execution_count: number | null
  execution_state: ExecutionState
  /**
   * When false, the cell is greyed out and not executed (Run All / Run cell).
   * Serialised as `cell.metadata.notebook_app.cell_enabled` only when false.
   * Absent or true means enabled.
   */
  enabled?: boolean
  /**
   * Single-line Python expression; body runs only when this evaluates truthy.
   * Default `True`. Serialised under `cell.metadata.notebook_app.run_condition`
   * when different from the default.
   */
  runCondition?: string
  /**
   * Last condition evaluation for UI (badge). Cleared when `source` or
   * `runCondition` changes.
   */
  conditionOutcome?: CellConditionOutcome | null
  /**
   * Set to true by a `clear_output { wait: true }` IOPub message; consumed on
   * the next non-status message when the output area is actually cleared.
   * Not serialised to .ipynb — stripped by the codec on save/load.
   */
  pendingClear?: boolean
  /**
   * When true, the code editor is shown collapsed (outputs stay visible).
   * Serialised under `cell.metadata.notebook_app.code_folded` in .ipynb.
   */
  codeFolded?: boolean
}

export interface MarkdownCell {
  id: CellId
  cell_type: 'markdown'
  source: string
  editing: boolean
}

export type Cell = CodeCell | MarkdownCell

export type KernelStatus = 'loading' | 'ready' | 'busy' | 'error'

export type KernelInitPhase =
  | 'boot'
  | 'worker'
  | 'runtime'
  | 'env'
  | 'bootstrap'
  | 'ready'
  | 'error'

export interface KernelInitState {
  phase: KernelInitPhase
  message: string
  progressPercent: number | null
  startedAtMs: number | null
  errorSummary: string | null
  errorDetail: string | null
}

export interface NotebookState {
  /** Display name without extension; used for download filename. */
  title: string
  cells: Cell[]
  selectedId: CellId | null
  executionCounter: number
  kernelStatus: KernelStatus
  kernelInit: KernelInitState
}

/**
 * Actions that mutate the set of cells and their authoring state. These
 * map to direct user actions on the cell toolbar (add/delete/duplicate,
 * move up/down, toggle markdown edit) plus source edits.
 */
export type CellStructureAction =
  | { type: 'ADD_CELL'; afterId?: CellId; cellType?: 'code' | 'markdown' }
  | { type: 'DELETE_CELL'; id: CellId }
  | { type: 'DUPLICATE_CELL'; id: CellId }
  | { type: 'MOVE_CELL'; id: CellId; direction: 'up' | 'down' }
  | { type: 'UPDATE_SOURCE'; id: CellId; source: string }
  | { type: 'SET_CODE_FOLDED'; id: CellId; folded: boolean }
  | { type: 'SET_CELL_ENABLED'; id: CellId; enabled: boolean }
  | { type: 'SET_RUN_CONDITION'; id: CellId; runCondition: string }
  | { type: 'SET_CONDITION_OUTCOME'; id: CellId; outcome: CellConditionOutcome | null }
  /** Return a pending code cell to idle without executing (condition false/error). */
  | { type: 'SKIP_CELL_TO_IDLE'; id: CellId }
  | { type: 'SELECT_CELL'; id: CellId }
  | { type: 'TOGGLE_MARKDOWN_EDIT'; id: CellId }

/**
 * Actions driving the per-cell execution lifecycle: enqueue → run →
 * finish/error. `CLEAR_ALL_PENDING` is used when a run is aborted.
 */
export type CellExecutionAction =
  | { type: 'ENQUEUE_CELL'; id: CellId }
  | { type: 'CLEAR_ALL_PENDING' }
  | { type: 'SET_RUNNING'; id: CellId }
  | { type: 'FINISH_CELL'; id: CellId; execution_count: number }
  | { type: 'ERROR_CELL'; id: CellId }

/**
 * Actions manipulating cell outputs. `IOPUB` is the streaming path that
 * the kernel drives; the others are direct user "Clear outputs" clicks
 * or internal append/replace used by the executor.
 */
export type CellOutputAction =
  | { type: 'APPEND_OUTPUT'; id: CellId; output: OutputRecord }
  | { type: 'REPLACE_OUTPUT_AT'; id: CellId; index: number; output: OutputRecord }
  | { type: 'IOPUB'; id: CellId; msg: IOPubMessage; executionCount: number | null }
  | { type: 'CLEAR_OUTPUTS'; id: CellId }
  | { type: 'CLEAR_ALL_OUTPUTS' }

/** Notebook-wide lifecycle actions: kernel status, restart, title, load. */
export type NotebookLifecycleAction =
  | { type: 'SET_KERNEL_STATUS'; status: KernelStatus }
  | {
      type: 'SET_KERNEL_INIT_PROGRESS'
      phase: KernelInitPhase
      message: string
      progressPercent: number | null
    }
  | { type: 'SET_KERNEL_INIT_ERROR'; summary: string; detail: string | null }
  | { type: 'RESTART' }
  | { type: 'SET_NOTEBOOK_TITLE'; title: string }
  | { type: 'LOAD_NOTEBOOK'; title: string; cells: Cell[] }

/**
 * Union of every action the notebook reducer accepts. Consumers should
 * accept `NotebookAction` for maximum flexibility; grouped subtypes are
 * available for code that only handles a single concern (e.g. a test or
 * a focused middleware). All subtypes unconditionally flow through the
 * same reducer — the split is purely documentational.
 */
export type NotebookAction =
  | CellStructureAction
  | CellExecutionAction
  | CellOutputAction
  | NotebookLifecycleAction
