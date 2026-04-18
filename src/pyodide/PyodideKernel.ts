import type { KernelResult, WorkerInbound, WorkerOutbound } from './types'

const PYODIDE_VERSION = '0.29.3'
const PYODIDE_CDN = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`

// Classic worker source (importScripts works in non-module workers).
// Embedded as a string so it runs at null-origin via a blob URL.
const WORKER_SOURCE = `
const PYODIDE_CDN = '${PYODIDE_CDN}';

importScripts(PYODIDE_CDN + 'pyodide.js');

let pyodide = null;

async function init() {
  pyodide = await loadPyodide({ indexURL: PYODIDE_CDN });
  self.postMessage({ type: 'ready' });
}

self.onmessage = async function(e) {
  const msg = e.data;
  if (msg.type !== 'exec') return;
  if (!pyodide) return;
  try {
    const result = await pyodide.runPythonAsync(msg.code);
    self.postMessage({ type: 'result', id: msg.id, value: String(result ?? '') });
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: err.message });
  }
};

init();
`

type Pending = { resolve: (r: KernelResult) => void }

export class PyodideKernel {
  readonly ready: Promise<void>
  private worker: Worker
  private pending = new Map<string, Pending>()

  constructor() {
    const blob = new Blob([WORKER_SOURCE], { type: 'application/javascript' })
    this.worker = new Worker(URL.createObjectURL(blob))

    let onReady: () => void
    let onFail: (e: ErrorEvent) => void
    this.ready = new Promise<void>((resolve, reject) => {
      onReady = resolve
      onFail = (e) => reject(new Error(e.message))
    })

    this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data
      if (msg.type === 'ready') {
        onReady()
        return
      }
      const p = this.pending.get(msg.id)
      if (!p) return
      this.pending.delete(msg.id)
      if (msg.type === 'result') p.resolve({ value: msg.value })
      else p.resolve({ error: msg.message })
    }

    this.worker.onerror = (e) => onFail(e)
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
