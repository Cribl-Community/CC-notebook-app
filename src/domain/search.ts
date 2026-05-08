/** Max rows shown in the %%cribl_search interactive table preview (full DataFrame may be larger). */
export const DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS = 20

export type SearchProgressEvent = {
  fraction: number
  label: string
}

export type SearchJobResult = {
  rows: Record<string, unknown>[]
  columns: string[]
  totalRecords: number | null
}
