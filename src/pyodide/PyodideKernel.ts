import type { CellOutput, KernelResult, WorkerInbound, WorkerOutbound } from './types'
import { PYODIDE_PACKAGE_BASE_URL } from './pyodideVersion'

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
      pyodide = await loadPyodide({
        indexURL: msg.pyodideBaseUrl,
        packageBaseUrl: msg.pyodidePackageBaseUrl,
      });
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init_error', message: err.message });
    }
    return;
  }

  if (msg.type === 'exec') {
    if (!pyodide) return;
    const id = msg.id;
    pyodide.setStdout({ batched: function(text) {
      self.postMessage({ type: 'stream', id: id, name: 'stdout', text: text });
    }});
    pyodide.setStderr({ batched: function(text) {
      self.postMessage({ type: 'stream', id: id, name: 'stderr', text: text });
    }});
    try {
      await pyodide.loadPackagesFromImports(msg.code);
      const result = await pyodide.runPythonAsync(msg.code);
      self.postMessage({ type: 'result', id: id, value: String(result ?? '') });
    } catch (err) {
      const message = err.message || String(err);
      const lines = message.split('\\n');
      const nonEmpty = lines.filter(function(l) { return l.trim().length > 0; });
      const lastLine = nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1] : '';
      const colonIdx = lastLine.indexOf(': ');
      const ename = colonIdx > 0 ? lastLine.slice(0, colonIdx) : 'Error';
      const evalue = colonIdx > 0 ? lastLine.slice(colonIdx + 2) : lastLine;
      self.postMessage({ type: 'error', id: id, ename: ename, evalue: evalue, traceback: lines });
    }
  }
};
`

type Pending = {
  outputs: CellOutput[]
  onStream?: (name: 'stdout' | 'stderr', text: string) => void
  resolve: (r: KernelResult) => void
}

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

    this.worker.onmessage = (e: MessageEvent<WorkerOutbound>) => {
      const msg = e.data
      if (msg.type === 'ready') { onReady(); return }
      if (msg.type === 'init_error') { onFail(msg.message); return }

      if (msg.type === 'stream') {
        const p = this.pending.get(msg.id)
        if (!p) return
        const output: CellOutput = { output_type: 'stream', name: msg.name, text: msg.text }
        p.outputs.push(output)
        p.onStream?.(msg.name, msg.text)
        return
      }

      if (msg.type === 'result') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.value !== '') {
          p.outputs.push({ output_type: 'execute_result', data: msg.value })
        }
        p.resolve({ outputs: p.outputs })
        return
      }

      if (msg.type === 'error') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        p.outputs.push({ output_type: 'error', ename: msg.ename, evalue: msg.evalue, traceback: msg.traceback })
        p.resolve({ outputs: p.outputs })
        return
      }
    }

    this.worker.onerror = (e) => onFail(e.message)

    // Resolve the pyodide base URL from the app's own origin so the worker
    // loads static files from the same host instead of an external CDN.
    const pyodideBaseUrl = new URL('./pyodide/', window.location.href).href
    const initMsg: WorkerInbound = {
      type: 'init',
      pyodideBaseUrl,
      pyodidePackageBaseUrl: PYODIDE_PACKAGE_BASE_URL,
    }
    this.worker.postMessage(initMsg)
  }

  execute(
    code: string,
    onStream?: (name: 'stdout' | 'stderr', text: string) => void,
  ): Promise<KernelResult> {
    const id = crypto.randomUUID()
    const outputs: CellOutput[] = []
    return new Promise<KernelResult>((resolve) => {
      this.pending.set(id, { outputs, onStream, resolve })
      this.worker.postMessage({ type: 'exec', id, code } satisfies WorkerInbound)
    })
  }

  dispose(): void {
    this.worker.terminate()
    for (const p of this.pending.values()) {
      p.resolve({ outputs: [] })
    }
    this.pending.clear()
  }
}
