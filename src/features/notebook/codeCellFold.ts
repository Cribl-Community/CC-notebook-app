import type { Cell, CodeCell } from '@features/notebook/model/types'
import { isRiptidePromptCell } from '@features/ai-riptide/riptideService'

/** nbformat `cell.metadata` namespace for app-specific UI state. */
export const IPYNB_NOTEBOOK_APP_KEY = 'notebook_app' as const
export const IPYNB_CODE_FOLDED_KEY = 'code_folded' as const
/** Persisted only when false; absent means the cell is enabled. */
export const IPYNB_CELL_ENABLED_KEY = 'cell_enabled' as const
export const IPYNB_RUN_CONDITION_KEY = 'run_condition' as const

/** Default run-condition expression (Python). */
export const DEFAULT_RUN_CONDITION = 'True' as const

export function normalizeRunCondition(raw: string | undefined): string {
  const t = (raw ?? '').trim()
  return t.length > 0 ? t : DEFAULT_RUN_CONDITION
}

/** Code cells with more than this many lines may be folded by default (example notebooks). */
export const LONG_CODE_FOLD_LINE_THRESHOLD = 10

export function sourceLineCount(source: string): number {
  if (source.length === 0) return 1
  return source.split('\n').length
}

export function isLongCodeCellForDefaultFold(source: string): boolean {
  return sourceLineCount(source) > LONG_CODE_FOLD_LINE_THRESHOLD
}

export type ParsedCodeCellNotebookApp = {
  codeFolded?: boolean
  /** Only read when explicitly false in metadata. */
  cellDisabled?: boolean
  runCondition?: string
}

export function parseCodeCellNotebookAppFields(metadata: unknown): ParsedCodeCellNotebookApp {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {}
  const na = (metadata as Record<string, unknown>)[IPYNB_NOTEBOOK_APP_KEY]
  if (!na || typeof na !== 'object' || Array.isArray(na)) return {}
  const block = na as Record<string, unknown>
  const out: ParsedCodeCellNotebookApp = {}
  const folded = block[IPYNB_CODE_FOLDED_KEY]
  if (typeof folded === 'boolean') out.codeFolded = folded
  const enabled = block[IPYNB_CELL_ENABLED_KEY]
  if (enabled === false) out.cellDisabled = true
  const rc = block[IPYNB_RUN_CONDITION_KEY]
  if (typeof rc === 'string') out.runCondition = rc
  return out
}

export function parseCodeFoldedFromCellMetadata(metadata: unknown): boolean | undefined {
  return parseCodeCellNotebookAppFields(metadata).codeFolded
}

/** Builds `cell.metadata` for a code cell (nbformat). Omits keys when values match defaults. */
export function buildCodeCellNotebookAppMetadata(cell: CodeCell): Record<string, unknown> {
  const inner: Record<string, unknown> = {}
  if (cell.codeFolded !== undefined) {
    inner[IPYNB_CODE_FOLDED_KEY] = cell.codeFolded
  }
  if (cell.enabled === false) {
    inner[IPYNB_CELL_ENABLED_KEY] = false
  }
  const rc = normalizeRunCondition(cell.runCondition)
  if (rc !== DEFAULT_RUN_CONDITION) {
    inner[IPYNB_RUN_CONDITION_KEY] = rc
  }
  if (Object.keys(inner).length === 0) return {}
  return { [IPYNB_NOTEBOOK_APP_KEY]: inner }
}

/**
 * Example notebooks: fold long code cells by default unless the ipynb already set
 * `code_folded` or the cell is a Riptide `# ### Prompt:` cell.
 */
export function applyExampleDefaultCodeFold(cells: Cell[]): Cell[] {
  return cells.map((c) => {
    if (c.cell_type !== 'code') return c
    if (c.codeFolded !== undefined) return c
    if (!isLongCodeCellForDefaultFold(c.source)) return c
    if (isRiptidePromptCell(c.source)) return { ...c, codeFolded: false }
    return { ...c, codeFolded: true }
  })
}

export function codeCellCanToggleFold(cell: CodeCell): boolean {
  return isLongCodeCellForDefaultFold(cell.source)
}
