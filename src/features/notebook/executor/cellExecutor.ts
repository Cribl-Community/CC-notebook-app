import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage } from '@platform/pyodide/types'
import type { CellId, NotebookAction } from '@features/notebook/model/types'

/** Outcome of running one cell. `error` stops further queued cells; `stale` means the run was superseded. */
export type CellRunOutcome = 'ok' | 'error' | 'stale'

/** Inputs shared by every cell executor. */
export interface CellExecutionContext {
  kernel: KernelPort
  cellId: CellId
  source: string
  executionCount: number
  emitIOPub: (msg: IOPubMessage) => void
  /** True when this run was superseded (e.g. kernel restart, stop). */
  isStale: () => boolean
  dispatchNotebook: (action: NotebookAction) => void
}

/**
 * Strategy for executing a single cell. Executors are registered in a
 * priority list; the first one whose {@link matches} returns true handles
 * the cell. This keeps special-case syntax like `%cribl_search` out of the
 * hot path for plain Python cells and lets new execution modes be added
 * without further branching inside the reducer or the run loop.
 */
export interface CellExecutor {
  /** Human-readable name used in logs and tests. */
  readonly name: string
  /** Fast prefilter so registries don't run expensive parsers eagerly. */
  matches(source: string): boolean
  execute(ctx: CellExecutionContext): Promise<CellRunOutcome>
}

/**
 * Picks the first matching executor. Order matters: specialized executors
 * (Cribl search magic) should come before the catch-all Python executor.
 */
export function selectExecutor(
  source: string,
  registry: readonly CellExecutor[],
): CellExecutor | null {
  for (const ex of registry) {
    if (ex.matches(source)) return ex
  }
  return null
}
