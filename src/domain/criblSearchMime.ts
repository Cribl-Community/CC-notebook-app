/** Mime key for structured Cribl Search cell output in `.ipynb` display_data. */
export const CRIBL_SEARCH_MIME = 'application/vnd.cribl.notebook.cribl-search+json'

export type CriblSearchPayload =
  | { kind: 'running'; progress: number; label: string }
  | {
      kind: 'completed'
      columns: string[]
      rows: Record<string, unknown>[]
      recordsReturned: number
      totalRecords: number | null
      /** Pandas DataFrame variable in the kernel (from `var=` or default `results_df`). Omitted in older saved notebooks. */
      dataframeVar?: string
      /** When false, interactive table is hidden (`preview=false` on %%cribl_search). Omitted/undefined = show table. */
      showTable?: boolean
      /** When true, English was translated to KQL but no search job ran (`translate_only=true`). */
      translateOnly?: boolean
      /** KQL shown in output when `translateOnly` is set (mirrors stdout `Generated KQL:`). */
      generatedKql?: string
    }
  | { kind: 'failed'; message: string }
