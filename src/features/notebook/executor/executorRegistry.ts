import { criblApiExecutor } from './criblApiExecutor'
import { criblSearchExecutor } from './criblSearchExecutor'
import { pythonExecutor } from './pythonExecutor'
import type { CellExecutor } from './cellExecutor'

/**
 * Default ordered registry of executors. Specialized executors must come
 * first so `selectExecutor` picks them before falling through to the
 * catch-all Python executor (which matches every source).
 */
export const DEFAULT_CELL_EXECUTORS: readonly CellExecutor[] = [
  criblApiExecutor,
  criblSearchExecutor,
  pythonExecutor,
]
