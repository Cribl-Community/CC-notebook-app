export type CompletionKind = 'module' | 'class' | 'function' | 'instance'

export type CompletionItem = { name: string; kind: CompletionKind }

/**
 * A Jupyter MIME bundle. Each value is the canonical text/binary form for that
 * mime type. Per nbformat 4.x, values may be stored as a string OR an array of
 * strings on disk; we always normalize to a single string in memory and only
 * ever emit a single string when serializing.
 *
 * Binary mime types (image/png, image/jpeg) are base64-encoded strings.
 */
export type MimeBundle = Record<string, string>

export type MimeMetadata = Record<string, unknown>

/** Structured cell output records, modelled after JupyterLab's `IOutputModel`. */
export type StreamOutput = {
  output_type: 'stream'
  name: 'stdout' | 'stderr'
  text: string
}

export type DisplayDataOutput = {
  output_type: 'display_data'
  data: MimeBundle
  metadata: MimeMetadata
  /** Stable id used by `update_display_data` to locate this record. */
  display_id?: string
}

export type ExecuteResultOutput = {
  output_type: 'execute_result'
  execution_count: number | null
  data: MimeBundle
  metadata: MimeMetadata
  display_id?: string
}

export type ErrorOutput = {
  output_type: 'error'
  ename: string
  evalue: string
  traceback: string[]
}

export type OutputRecord = StreamOutput | DisplayDataOutput | ExecuteResultOutput | ErrorOutput

/** Backwards-compatible alias for the old union name. */
export type CellOutput = OutputRecord

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
    }
  | { kind: 'failed'; message: string }

/**
 * IOPub-style messages emitted by the kernel during a single execution.
 * Mirrors the subset of Jupyter's IOPub channel that we need: stream,
 * display_data, execute_result, update_display_data, clear_output, error,
 * and status.
 */
export type IOPubMessage =
  | { msg_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | {
      msg_type: 'display_data'
      data: MimeBundle
      metadata: MimeMetadata
      transient?: { display_id?: string }
    }
  | {
      msg_type: 'execute_result'
      execution_count: number | null
      data: MimeBundle
      metadata: MimeMetadata
      transient?: { display_id?: string }
    }
  | {
      msg_type: 'update_display_data'
      data: MimeBundle
      metadata: MimeMetadata
      transient: { display_id: string }
    }
  | { msg_type: 'clear_output'; wait: boolean }
  | { msg_type: 'error'; ename: string; evalue: string; traceback: string[] }
  | { msg_type: 'status'; execution_state: 'busy' | 'idle' }

/**
 * Subset of `RequestInit` the worker → main-thread fetch bridge forwards.
 * Bodies are normalised to `ArrayBuffer | string | undefined` so they survive
 * `postMessage` without referencing a `ReadableStream`.
 */
export type ForwardedFetchInit = {
  method?: string
  headers?: Record<string, string>
  body?: ArrayBuffer | string | null
  credentials?: RequestCredentials
  redirect?: RequestRedirect
  referrer?: string
  referrerPolicy?: ReferrerPolicy
  cache?: RequestCache
  mode?: RequestMode
  integrity?: string
}

export type WorkerInbound =
  | {
      type: 'init'
      pyodideBaseUrl: string
      pyodidePackageBaseUrl: string
      /** Full URL of bundled `pyodide-lock.json` on this app origin (CSP-safe vs jsDelivr fetch). */
      pyodideLockFileUrl: string
      appOrigin: string
    }
  | { type: 'exec'; id: string; code: string; execution_count: number }
  | { type: 'complete'; id: string; code: string; cursor: number }
  | {
      type: 'fetch_response'
      id: string
      ok?: boolean
      status?: number
      statusText?: string
      headers?: Record<string, string>
      body?: ArrayBuffer
      url?: string
      error?: string
    }

export type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'init_error'; message: string }
  | { type: 'iopub'; id: string; msg: IOPubMessage }
  | { type: 'complete_result'; id: string; options: CompletionItem[] }
  | {
      type: 'fetch_request'
      id: string
      url: string
      init: ForwardedFetchInit
    }

export type KernelResult = { outputs: OutputRecord[] }
