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
