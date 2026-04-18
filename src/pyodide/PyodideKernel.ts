import type { KernelResult, WorkerInbound, WorkerOutbound } from './types'

// Worker source as a classic-worker string (not ES module) so importScripts is available.
// The pyodide URL is passed via the first 'init' message so the worker loads from
// the app's own origin rather than a CDN — required in Cribl's sandboxed iframe
// where external importScripts calls are blocked.
const WORKER_SOURCE = `
let pyodide = null;

self.onmessage = async function(e) {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      importScripts(msg.pyodideBaseUrl + 'pyodide.js');
      pyodide = await loadPyodide({ indexURL: msg.pyodideBaseUrl });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init_error', message: err.message });
    }
    return;
  }

  if (msg.type === 'exec') {
    if (!pyodide) return;
    try {
      const result = await pyodide.runPythonAsync(msg.code);
      self.postMessage({ type: 'result', id: msg.id, value: String(result ?? '') });
    } catch (err) {
      self.postMessage({ type: 'error', id: msg.id, message: err.message });
    }
  }
};
`

type Pending = { resolve: (r: KernelResult) => void }

export class PyodideKernel {
  readonly ready: Promise<void>
  private worker: Worker
  private pending = new Map<string, Pending>()

  constructor() {
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
    this.worker = new Worker(URL.createObjectURL(blob))

    let onReady!: () => void
    let onFail!: (msg: string) => void
    this.ready = new Promise<void>((resolve, reject) => {
      onReady = resolve
      onFail = (msg) => reject(new Error(msg))
    })

    this.worker.onmessage = (e: MessageEvent<WorkerOutbound | { type: 'init_error'; message: string }>) => {
      const msg = e.data
      if (msg.type === 'ready') { onReady(); return }
      if (msg.type === 'init_error') { onFail(msg.message); return }
      if (msg.type === 'result' || msg.type === 'error') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.type === 'result') p.resolve({ value: msg.value })
        else p.resolve({ error: msg.message })
      }
    }

    this.worker.onerror = (e) => onFail(e.message)

    // Resolve the pyodide base URL from the app's own origin so the worker
    // loads static files from the same host instead of an external CDN.
    const pyodideBaseUrl = new URL('./pyodide/', window.location.href).href
    const initMsg: WorkerInbound = { type: 'init', pyodideBaseUrl }
    this.worker.postMessage(initMsg)
  }

  execute(code: string): Promise<KernelResult> {
    const id = crypto.randomUUID()
    const msg: WorkerInbound = { type: 'exec', id, code }
    return new Promise<KernelResult>((resolve) => {
      this.pending.set(id, { resolve })
      this.worker.postMessage(msg)
    })
  }

  dispose(): void {
    this.worker.terminate()
    this.pending.clear()
  }
}
