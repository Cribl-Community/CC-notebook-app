import type { LookupService } from '@ports/LookupService'
import type { SearchService } from '@ports/SearchService'
// eslint-disable-next-line no-restricted-imports -- sole wiring of platform fetch helpers into default executors (see docs/ARCHITECTURE.md).
import { cellExecutorFetchHelpers } from '@platform/adapters/cellExecutorFetchHelpers'
import {
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiNoneAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
  encodeUtf8TextForPythonBase64,
  encodeValueJsonForPythonBase64,
  parseCriblApiMagic,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
} from '@features/cribl-api/criblApiMagic'
import { runNotebookJinjaInKernel } from '@features/notebook/jinjaInKernel'
import { filterPyodidePackageChatter } from '@features/cribl-search'
import { createCriblApiExecutor } from './criblApiExecutor'
import { createCriblSearchLookupExecutor } from './criblSearchLookupExecutor'
import { createCriblSearchExecutor } from './criblSearchExecutor'
import { pythonExecutor } from './pythonExecutor'
import type { CellExecutor } from './cellExecutor'

/**
 * Default ordered registry of cell executors. Specialized executors must come
 * first so `selectExecutor` picks them before falling through to the
 * catch-all Python executor (which matches every source).
 *
 * Search-backed execution uses a {@link SearchService} implementation from
 * the composition root (see {@link SearchProvider} and {@link LookupProvider}). The stub here exists so
 * callers that omit `executors` (mostly unit tests for plain Python cells)
 * still resolve the registry shape; production passes real services via
 * {@link createDefaultCellExecutors}.
 *
 * `cellExecutorFetchHelpers` is imported here (the single composition point) so
 * executor modules under `features/` do not reach into `@platform/cribl/*`
 * directly — see `docs/ARCHITECTURE.md`.
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
  async deleteLookup() {},
}

const productionCriblApiExecutor = createCriblApiExecutor({
  parseCriblApiMagic,
  getCriblApiBase: cellExecutorFetchHelpers.getCriblApiBase,
  runNotebookJinjaInKernel,
  filterPyodidePackageChatter,
  callCriblApi: cellExecutorFetchHelpers.callCriblApi,
  describeFetchError: cellExecutorFetchHelpers.describeFetchError,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
  encodeValueJsonForPythonBase64,
  encodeUtf8TextForPythonBase64,
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiNoneAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
})

export function createDefaultCellExecutors(
  searchService: SearchService,
  criblApiBase: string,
  lookupService: LookupService,
): readonly CellExecutor[] {
  return [
    productionCriblApiExecutor,
    createCriblSearchLookupExecutor({
      lookupService,
      criblApiBase,
      describeFetchError: cellExecutorFetchHelpers.describeFetchError,
    }),
    createCriblSearchExecutor({
      searchService,
      criblApiBase,
      describeFetchError: cellExecutorFetchHelpers.describeFetchError,
      isCorsOrNetworkFetchError: cellExecutorFetchHelpers.isCorsOrNetworkFetchError,
      stubEnglishToKqlLocalDev: cellExecutorFetchHelpers.stubEnglishToKqlLocalDev,
    }),
    pythonExecutor,
  ]
}

export const DEFAULT_CELL_EXECUTORS: readonly CellExecutor[] = createDefaultCellExecutors(
  UNIT_TEST_STUB_SEARCH_SERVICE,
  '',
  UNIT_TEST_STUB_LOOKUP_SERVICE,
)
