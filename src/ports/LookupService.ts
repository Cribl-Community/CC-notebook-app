/**
 * Port for Cribl Search lookup file CRUD used by `%%cribl_save_search_lookup` /
 * `%%cribl_load_search_lookup`. The default adapter uses `/m/{group}/system/lookups`
 * (typically `default_search` in hosted Search).
 */

export type SearchLookupStorageMode = 'memory' | 'disk'

export type SaveSearchLookupOptions = {
  /** Config group prefix (e.g. `default_search`). */
  group: string
  /**
   * Lookup filename as used in Search / KQL (usually ends with `.csv`).
   * The adapter normalizes to include `.csv` when omitted.
   */
  lookupId: string
  /** UTF-8 CSV body including header row. */
  csvUtf8: string
  /** When a lookup with this id already exists, replace it instead of failing. */
  replace: boolean
  /** In-memory (default) or disk-backed lookup when creating. */
  mode: SearchLookupStorageMode
}

export interface LookupService {
  saveLookupFromCsv(opts: SaveSearchLookupOptions): Promise<void>
  /** Raw CSV text from `GET .../content?raw=1`. */
  downloadLookupCsv(opts: { group: string; lookupId: string }): Promise<string>
}
