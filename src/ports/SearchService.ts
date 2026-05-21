/**
 * Port for Cribl Search integration used by the %%cribl_search magic executor.
 * The default adapter talks to the Cribl Search REST API; tests substitute a
 * deterministic stub.
 */
import type {
  SearchJobResult,
  SearchProgressEvent,
  TranslateEnglishToKqlOptions,
} from '@/domain/search'

export type {
  SearchJobResult as CriblSearchJobResult,
  SearchProgressEvent,
  TranslateEnglishToKqlOptions,
}

export interface SearchRunOptions {
  query: string
  queryMode?: 'verbatim' | 'canonical'
  maxRows?: number
  earliest?: string
  latest?: string
  /** Max time to wait for job completion while polling status (ms). */
  pollTimeoutMs?: number
  onProgress?: (ev: SearchProgressEvent) => void
}

export interface SearchService {
  runSearch(opts: SearchRunOptions): Promise<SearchJobResult>
  translateEnglishToKql(englishQuery: string, options?: TranslateEnglishToKqlOptions): Promise<string>
}
