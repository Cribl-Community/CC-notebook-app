import type { LookupService } from '@ports/LookupService'
import type { SearchService } from '@ports/SearchService'
import { criblApiExecutor } from './criblApiExecutor'
import { createCriblSearchLookupExecutor } from './criblSearchLookupExecutor'
import { createCriblSearchExecutor } from './criblSearchExecutor'
import { pythonExecutor } from './pythonExecutor'
import type { CellExecutor } from './cellExecutor'

/**
 * Default ordered registry of executors. Specialized executors must come
 * first so `selectExecutor` picks them before falling through to the
 * catch-all Python executor (which matches every source).
 *
 * Search-backed execution uses a {@link SearchService} implementation from
 * the composition root (see {@link SearchProvider} and {@link LookupProvider}). The stub here exists so
 * callers that omit `executors` (mostly unit tests for plain Python cells)
 * still resolve the registry shape; production passes real services via
 * {@link createDefaultCellExecutors}.
 */
const UNIT_TEST_STUB_SEARCH_SERVICE: SearchService = {
  async runSearch() {
    return { rows: [], columns: [], totalRecords: null }
  },
  async translateEnglishToKql(q: string) {
    return q
  },
}

const UNIT_TEST_STUB_LOOKUP_SERVICE: LookupService = {
  async saveLookupFromCsv() {},
  async downloadLookupCsv() {
    return 'a,b\n1,2\n'
  },
}

export function createDefaultCellExecutors(
  searchService: SearchService,
  criblApiBase: string,
  lookupService: LookupService,
): readonly CellExecutor[] {
  return [
    criblApiExecutor,
    createCriblSearchLookupExecutor({ lookupService, criblApiBase }),
    createCriblSearchExecutor({ searchService, criblApiBase }),
    pythonExecutor,
  ]
}

export const DEFAULT_CELL_EXECUTORS: readonly CellExecutor[] = createDefaultCellExecutors(
  UNIT_TEST_STUB_SEARCH_SERVICE,
  '',
  UNIT_TEST_STUB_LOOKUP_SERVICE,
)
