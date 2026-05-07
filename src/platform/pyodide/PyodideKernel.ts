import type {
  CompletionItem,
  IOPubMessage,
  KernelResult,
  OutputRecord,
  WorkerInbound,
  WorkerOutbound,
} from '@platform/pyodide/types'
import type { KernelInitError, KernelInitProgress } from '@ports/KernelPort'
import { fetchWithPackageSessionCache } from '@platform/pyodide/packageFetchCache'
import {
  getSameOriginPyodideBaseUrl,
  getSameOriginPyodideLockFileUrl,
  PYODIDE_PACKAGE_BASE_URL,
} from '@platform/pyodide/pyodideVersion'
import { applyIOPubToRecords } from '@features/notebook/reducer/outputArea'
import completionPy from './notebook_complete.py?raw'
import iopubBootstrapPy from './notebook_iopub_bootstrap.py?raw'
import workerSourceTemplate from './kernel.worker.js?raw'

// Worker source as a classic-worker string (not ES module) so importScripts is
// available. The Python bootstrap modules are injected via placeholders in
// `kernel.worker.js` (extracted for lint/type coverage). The pyodide URL is
// passed via the first `init` message so the worker loads from the app's own
// origin rather than a CDN — required in Cribl's sandboxed iframe where
// external importScripts calls are blocked.
const WORKER_SOURCE = workerSourceTemplate
  .replace("'__NB_COMPLETION_PY__'", JSON.stringify(completionPy))
  .replace("'__NB_IOPUB_BOOTSTRAP_PY__'", JSON.stringify(iopubBootstrapPy))

// Fail loudly if placeholders weren't replaced (e.g. the worker file was edited
// and the sentinels no longer match). Silent failures here would surface as
// cryptic pyodide init errors at runtime.
if (WORKER_SOURCE.includes('__NB_COMPLETION_PY__') || WORKER_SOURCE.includes('__NB_IOPUB_BOOTSTRAP_PY__')) {
  throw new Error('PyodideKernel: worker source placeholder substitution failed')
}


type Pending = {
  outputs: OutputRecord[]
  onIOPub?: (msg: IOPubMessage) => void
  resolve: (r: KernelResult) => void
}

export class PyodideKernel {
  readonly ready: Promise<void>
  private readonly appPyodideBaseUrl: string
  /**
   * Shared 1-byte buffer for Pyodide SIGINT (value 2). Unavailable when
   * SharedArrayBuffer is missing or blocked by the embedding context.
   */
  private readonly interruptSignal: Uint8Array | null
  private worker: Worker
  private pending = new Map<string, Pending>()
  private pendingComplete = new Map<string, (opts: CompletionItem[]) => void>()
  private initProgressListener: ((progress: KernelInitProgress) => void) | null = null
  private lastInitError: KernelInitError | null = null

  constructor() {
    let interruptSignal: Uint8Array | null = null
    try {
      if (typeof SharedArrayBuffer !== 'undefined') {
        interruptSignal = new Uint8Array(new SharedArrayBuffer(1))
      }
    } catch {
      interruptSignal = null
    }
    this.interruptSignal = interruptSignal

    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
    this.worker = new Worker(URL.createObjectURL(blob))

    let onReady!: () => void
    let onFail!: (msg: string) => void
    this.ready = new Promise<void>((resolve, reject) => {
      onReady = resolve
      onFail = (msg) => reject(new Error(msg))
    })

    this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data
      if (msg.type === 'ready') {
        this.lastInitError = null
        onReady()
        return
      }
      if (msg.type === 'init_progress') {
        try {
          this.initProgressListener?.({
            phase: msg.phase,
            message: msg.message,
            progressPercent: msg.progressPercent,
          })
        } catch {
          // best-effort
        }
        return
      }
      if (msg.type === 'init_error') {
        this.lastInitError = {
          summary: msg.message,
          detail: msg.detail ?? null,
        }
        onFail(msg.message)
        return
      }

      if (msg.type === 'complete_result') {
        const p = this.pendingComplete.get(msg.id)
        if (!p) return
        this.pendingComplete.delete(msg.id)
        p(msg.options)
        return
      }

      if (msg.type === 'iopub') {
        const p = this.pending.get(msg.id)
        if (!p) return
        const iopub = msg.msg
        p.outputs = applyIOPubToRecords(p.outputs, iopub)
        try {
          p.onIOPub?.(iopub)
        } catch {
          // best-effort
        }
        if (iopub.msg_type === 'status' && iopub.execution_state === 'idle') {
          this.pending.delete(msg.id)
          p.resolve({ outputs: p.outputs })
        }
        return
      }

      if (msg.type === 'fetch_request') {
        void this.handleFetchRequest(msg.id, msg.url, msg.init)
        return
      }
    }

    this.worker.onerror = (e: ErrorEvent) => {
      console.error('[PyodideKernel] worker error', e.message, e.filename, e.lineno, e.colno, e.error)
      onFail(e.message || 'Worker failed')
    }

    const pyodideBaseUrl = getSameOriginPyodideBaseUrl()
    this.appPyodideBaseUrl = pyodideBaseUrl
    const pyodideLockFileUrl = getSameOriginPyodideLockFileUrl()
    const criblApiUrl =
      typeof window !== 'undefined' ? (window.CRIBL_API_URL?.trim() ?? '') : ''

    const initMsg: WorkerInbound = {
      type: 'init',
      pyodideBaseUrl,
      pyodidePackageBaseUrl: PYODIDE_PACKAGE_BASE_URL,
      pyodideLockFileUrl,
      appOrigin: window.location.origin,
      criblApiUrl,
      ...(this.interruptSignal
        ? { interruptSharedArrayBuffer: this.interruptSignal.buffer as SharedArrayBuffer }
        : {}),
    }
    this.worker.postMessage(initMsg)
  }

  setInitProgressListener(
    listener: ((progress: KernelInitProgress) => void) | null,
  ): void {
    this.initProgressListener = listener
  }

  getLastInitError(): KernelInitError | null {
    return this.lastInitError
  }

  execute(
    code: string,
    onIOPub?: (msg: IOPubMessage) => void,
    executionCount = 0,
  ): Promise<KernelResult> {
    const id = crypto.randomUUID()
    const outputs: OutputRecord[] = []
    return new Promise<KernelResult>((resolve) => {
      this.pending.set(id, { outputs, onIOPub, resolve })
      const exec: WorkerInbound = {
        type: 'exec',
        id,
        code,
        execution_count: executionCount,
      }
      this.worker.postMessage(exec)
    })
  }

  complete(code: string, cursor: number): Promise<CompletionItem[]> {
    const id = crypto.randomUUID()
    return new Promise<CompletionItem[]>((resolve) => {
      this.pendingComplete.set(id, resolve)
      this.worker.postMessage({ type: 'complete', id, code, cursor } satisfies WorkerInbound)
    })
  }

  /** Raises KeyboardInterrupt in Python when an interrupt buffer is configured (Pyodide docs: write 2). */
  interrupt(): Promise<void> {
    if (!this.interruptSignal) return Promise.resolve()
    this.interruptSignal[0] = 2
    return Promise.resolve()
  }

  /**
   * Bridge for the worker's `fetch()` calls: cross-origin (micropip → PyPI,
   * jsDelivr wheels) and same-origin `public/pyodide/` assets (routed to the
   * main thread so `packageFetchCache` dedupes across kernels). The Cribl
   * iframe patches the main-thread `fetch` so external URLs are routed through
   * `/api/v1/p/<pack>/proxy/...` with auth injected by the parent window.
   * Workers don't see that patch, so they delegate up here and we hand back a
   * serialised Response.
   *
   * NOTE: We intentionally do NOT forward the worker's custom `headers` to
   * `window.fetch`. The Cribl platform patch injects the `Authorization` header
   * only when no explicit headers object is passed; supplying caller headers
   * (e.g. micropip's `Accept: application/vnd.pypi.simple.v1+json`) causes the
   * auth injection to be skipped, resulting in HTTP 401 from the pack proxy.
   * Dropping the headers is safe: wheel GETs need none, and pypi.org returns
   * text/html by default which micropip's `from_simple_html_api` handles.
   */
  private async handleFetchRequest(
    id: string,
    url: string,
    init: import('@platform/pyodide/types').ForwardedFetchInit,
  ): Promise<void> {
    try {
      const fetchInit: RequestInit = {
        method: init.method,
        // headers intentionally omitted — see note above
        credentials: init.credentials,
        redirect: init.redirect,
        referrer: init.referrer,
        referrerPolicy: init.referrerPolicy,
        // Force no-store so the browser never tries to check its HTTP cache;
        // in sandboxed iframes the default cache mode can block indefinitely.
        cache: 'no-store',
        mode: init.mode,
        integrity: init.integrity,
      }
      if (init.body != null && init.method && init.method !== 'GET' && init.method !== 'HEAD') {
        fetchInit.body = init.body as BodyInit
      }
      const r = await fetchWithPackageSessionCache(url, fetchInit, this.appPyodideBaseUrl)
      const buf = await r.arrayBuffer()
      const headers: Record<string, string> = {}
      r.headers.forEach((v, k) => {
        headers[k] = v
      })
      this.worker.postMessage(
        {
          type: 'fetch_response',
          id,
          ok: r.ok,
          status: r.status,
          statusText: r.statusText,
          headers,
          body: buf,
          url: r.url,
        },
        [buf],
      )
    } catch (err) {
      this.worker.postMessage({
        type: 'fetch_response',
        id,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  dispose(): void {
    this.initProgressListener = null
    this.worker.terminate()
    for (const p of this.pending.values()) {
      p.resolve({ outputs: [] })
    }
    this.pending.clear()
    for (const r of this.pendingComplete.values()) {
      r([])
    }
    this.pendingComplete.clear()
  }
}

