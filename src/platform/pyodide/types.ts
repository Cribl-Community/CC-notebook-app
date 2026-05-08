/**
 * Notebook/kernel DTOs are defined in {@link '@/domain/kernel'} and
 * {@link '@/domain/criblSearchMime'} — re-exported here for the Pyodide worker
 * bridge and legacy import paths.
 */
export type {
  CellOutput,
  CompletionKind,
  CompletionItem,
  DisplayDataOutput,
  ErrorOutput,
  ExecuteResultOutput,
  IOPubMessage,
  KernelIOPubMessage,
  KernelMimeBundle,
  KernelMimeMetadata,
  KernelOutputRecord,
  KernelResult,
  MimeBundle,
  MimeMetadata,
  OutputRecord,
  StreamOutput,
} from '@/domain/kernel'

export { CRIBL_SEARCH_MIME, type CriblSearchPayload } from '@/domain/criblSearchMime'

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

import type { CompletionItem, IOPubMessage } from '@/domain/kernel'

export type WorkerInbound =
  | {
      type: 'init'
      pyodideBaseUrl: string
      pyodidePackageBaseUrl: string
      /** Full URL of bundled `pyodide-lock.json` on this app origin (CSP-safe vs jsDelivr fetch). */
      pyodideLockFileUrl: string
      appOrigin: string
      /** Mirrors `window.CRIBL_API_URL` (empty when unset); copied into `os.environ["CRIBL_API_URL"]`. */
      criblApiUrl: string
      /**
       * Optional 1-byte SharedArrayBuffer for Pyodide keyboard interrupts (SIGINT).
       * Created on the main thread and registered with `pyodide.setInterruptBuffer` in the worker.
       */
      interruptSharedArrayBuffer?: SharedArrayBuffer
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
  | {
      type: 'init_progress'
      phase: 'boot' | 'worker' | 'runtime' | 'env' | 'bootstrap'
      message: string
      progressPercent: number | null
    }
  | {
      type: 'init_error'
      message: string
      detail?: string
      phase?: 'boot' | 'worker' | 'runtime' | 'env' | 'bootstrap'
    }
  | { type: 'iopub'; id: string; msg: IOPubMessage }
  | { type: 'complete_result'; id: string; options: CompletionItem[] }
  | {
      type: 'fetch_request'
      id: string
      url: string
      init: ForwardedFetchInit
    }
