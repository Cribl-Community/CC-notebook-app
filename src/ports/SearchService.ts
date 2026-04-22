/**
 * Port for Cribl Search integration used by the %%cribl_search magic executor.
 * The default adapter talks to the Cribl Search REST API; tests substitute a
 * deterministic stub.
 */
import type {
  CriblSearchJobResult,
  SearchProgressEvent,
} from '@platform/cribl/searchJobs'

export type { CriblSearchJobResult, SearchProgressEvent }

export interface SearchRunOptions {
  query: string
  queryMode?: 'verbatim' | 'canonical'
  maxRows?: number
  earliest?: string
  latest?: string
  onProgress?: (ev: SearchProgressEvent) => void
}

export interface SearchService {
  runSearch(opts: SearchRunOptions): Promise<CriblSearchJobResult>
  translateEnglishToKql(englishQuery: string, options?: { datasetHint?: string }): Promise<string>
}
