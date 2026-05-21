import type { Cell, CodeCell } from '@features/notebook/model/types'
import { isRiptidePromptCell } from '@features/ai-riptide/riptideService'

/** nbformat `cell.metadata` namespace for app-specific UI state. */
export const IPYNB_NOTEBOOK_APP_KEY = 'notebook_app' as const
export const IPYNB_CODE_FOLDED_KEY = 'code_folded' as const

/** Code cells with more than this many lines may be folded by default (example notebooks). */
export const LONG_CODE_FOLD_LINE_THRESHOLD = 10

export function sourceLineCount(source: string): number {
  if (source.length === 0) return 1
  return source.split('\n').length
}

export function isLongCodeCellForDefaultFold(source: string): boolean {
  return sourceLineCount(source) > LONG_CODE_FOLD_LINE_THRESHOLD
}

export function parseCodeFoldedFromCellMetadata(metadata: unknown): boolean | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined
  const na = (metadata as Record<string, unknown>)[IPYNB_NOTEBOOK_APP_KEY]
  if (!na || typeof na !== 'object' || Array.isArray(na)) return undefined
  const v = (na as Record<string, unknown>)[IPYNB_CODE_FOLDED_KEY]
  if (typeof v === 'boolean') return v
  return undefined
}

/** Serialised under `cell.metadata.notebook_app.code_folded`. Omits the block when unset. */
export function codeCellMetadataForIpynb(codeFolded: boolean | undefined): Record<string, unknown> {
  if (codeFolded === undefined) return {}
  return {
    [IPYNB_NOTEBOOK_APP_KEY]: {
      [IPYNB_CODE_FOLDED_KEY]: codeFolded,
    },
  }
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
