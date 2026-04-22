import type { CodeCell } from '@features/notebook/model/types'
import { createOutputArea, type OutputAreaState } from '@features/notebook/reducer/outputArea'

/**
 * Jupyter `clear_output { wait: true }` needs deferred output-area state that is
 * tied to the live {@link CodeCell} object identity, not to the serializable
 * `outputs` array alone. A WeakMap keeps that out of {@link NotebookState} and
 * ipynb round-trips while still surviving reducer immutability (new cell
 * objects reset the entry via `getOrInitCellOutputAreaState`).
 */
const cellOutputAreaStates = new WeakMap<CodeCell, OutputAreaState>()

export function getOrInitCellOutputAreaState(cell: CodeCell): OutputAreaState {
  const existing = cellOutputAreaStates.get(cell)
  if (existing && existing.records === cell.outputs) return existing
  return { records: cell.outputs, pendingClear: false }
}

export function resetCellOutputAreaForRun(updated: CodeCell): void {
  cellOutputAreaStates.set(updated, createOutputArea())
}

export function persistCellOutputAreaState(updated: CodeCell, next: OutputAreaState): void {
  cellOutputAreaStates.set(updated, next)
}
