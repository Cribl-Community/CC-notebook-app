/** Max rows shown in the %%cribl_search interactive table preview (full DataFrame may be larger). */
export const DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS = 20

/** Default %%cribl_search `timeout=` (seconds) while polling for job completion. */
export const DEFAULT_CRIBL_SEARCH_JOB_TIMEOUT_SEC = 180

/** Bounds for `timeout=` on %%cribl_search (seconds). */
export const MIN_CRIBL_SEARCH_JOB_TIMEOUT_SEC = 30
export const MAX_CRIBL_SEARCH_JOB_TIMEOUT_SEC = 3_600

export type SearchProgressEvent = {
  fraction: number
  label: string
}

export type SearchJobResult = {
  rows: Record<string, unknown>[]
  columns: string[]
  totalRecords: number | null
}

/** One entry in `context.datasetsInfo` for `POST /ai/q/agents/kql` (same shape as Cribl Search). */
export type KqlTranslateDatasetInfoEntry = { dataset: { id: string; description?: string } }

export type TranslateEnglishToKqlOptions = {
  datasetHint?: string
  /** When set, sent as `context.datasetsInfo` verbatim; otherwise built from `datasetHint`. */
  datasetsInfo?: ReadonlyArray<KqlTranslateDatasetInfoEntry>
}
