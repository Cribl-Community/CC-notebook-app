import type {
  CompletionItem,
  IOPubMessage,
  KernelResult,
  OutputRecord,
  WorkerInbound,
  WorkerOutbound,
} from './types'
import { getPyodidePackageBaseUrl } from './pyodideVersion'
import completionPy from './notebook_complete.py?raw'
import iopubBootstrapPy from './notebook_iopub_bootstrap.py?raw'

// Worker source as a classic-worker string (not ES module) so importScripts is available.
// The pyodide URL is passed via the first 'init' message so the worker loads from
// the app's own origin rather than a CDN — required in Cribl's sandboxed iframe
// where external importScripts calls are blocked.
const WORKER_SOURCE =
  `
let pyodide = null;
const COMPLETION_PY = ` +
  JSON.stringify(completionPy) +
  `;
const IOPUB_BOOTSTRAP_PY = ` +
  JSON.stringify(iopubBootstrapPy) +
  `;

function postIOPub(execId, msg) {
  self.postMessage({ type: 'iopub', id: execId, msg: msg });
}

self.onmessage = async function(e) {
  const msg = e.data;

  if (msg.type === 'init') {
    try {
      importScripts(msg.pyodideBaseUrl + 'pyodide.js');
      pyodide = await loadPyodide({
        indexURL: msg.pyodideBaseUrl,
        packageBaseUrl: msg.pyodidePackageBaseUrl,
      });
      // Preload IPython (so notebook_iopub_bootstrap can install its
      // DisplayPublisher) and micropip (optional user installs from PyPI when
      // network allows). Vendored lock packages; if load fails, bootstrap falls back.
      try {
        await pyodide.loadPackage(['ipython', 'micropip', 'jedi']);
      } catch (_) {
        // optional
      }
      await pyodide.runPythonAsync(COMPLETION_PY);
      await pyodide.runPythonAsync(IOPUB_BOOTSTRAP_PY);
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'init_error', message: err.message });
    }
    return;
  }

  if (msg.type === 'complete') {
    if (!pyodide) return;
    const id = msg.id;
    try {
      pyodide.globals.set('_nb_code', msg.code);
      pyodide.globals.set('_nb_cursor', msg.cursor);
      const jsonStr = await pyodide.runPythonAsync(
        '_notebook_complete_json(_nb_code, _nb_cursor)',
      );
      const options = JSON.parse(jsonStr);
      self.postMessage({ type: 'complete_result', id: id, options: options });
    } catch (err) {
      self.postMessage({ type: 'complete_result', id: id, options: [] });
    }
    return;
  }

  if (msg.type === 'exec') {
    if (!pyodide) return;
    const execId = msg.id;
    const execCount = msg.execution_count | 0;

    // Install the IOPub bridge for this execution. Python calls _NB_IOPUB(dict)
    // which lands here as a PyProxy → plain JS object.
    const bridge = (pyMsg) => {
      let plain;
      try {
        plain = pyMsg && typeof pyMsg.toJs === 'function'
          ? pyMsg.toJs({ dict_converter: Object.fromEntries })
          : pyMsg;
      } catch (_) {
        plain = pyMsg;
      } finally {
        try { pyMsg && pyMsg.destroy && pyMsg.destroy(); } catch (_) {}
      }
      try {
        postIOPub(execId, plain);
      } catch (err) {
        // Last-ditch: forward as a stream stderr message.
        try {
          postIOPub(execId, {
            msg_type: 'stream',
            name: 'stderr',
            text: String(err && err.message ? err.message : err) + '\\n',
          });
        } catch (_) {}
      }
    };

    pyodide.globals.set('_NB_IOPUB', bridge);

    postIOPub(execId, { msg_type: 'status', execution_state: 'busy' });
    try {
      // Load any imported packages BEFORE installing the user-facing stdout/stderr
      // hooks, so package loader chatter ("Loading X", "Loaded X") does not leak
      // into cell output.
      await pyodide.loadPackagesFromImports(msg.code);

      pyodide.setStdout({ batched: function(text) {
        postIOPub(execId, { msg_type: 'stream', name: 'stdout', text: text });
      }});
      pyodide.setStderr({ batched: function(text) {
        postIOPub(execId, { msg_type: 'stream', name: 'stderr', text: text });
      }});

      pyodide.globals.set('_nb_source_code', msg.code);
      pyodide.globals.set('_nb_exec_count', execCount);
      await pyodide.runPythonAsync('_nb_run(_nb_source_code, _nb_exec_count)');
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      const lines = message.split('\\n');
      const nonEmpty = lines.filter(function(l) { return l.trim().length > 0; });
      const lastLine = nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1] : '';
      const colonIdx = lastLine.indexOf(': ');
      const ename = colonIdx > 0 ? lastLine.slice(0, colonIdx) : 'Error';
      const evalue = colonIdx > 0 ? lastLine.slice(colonIdx + 2) : lastLine;
      postIOPub(execId, {
        msg_type: 'error',
        ename: ename,
        evalue: evalue,
        traceback: lines,
      });
    } finally {
      try { pyodide.globals.set('_NB_IOPUB', null); } catch (_) {}
      try { pyodide.setStdout({}); } catch (_) {}
      try { pyodide.setStderr({}); } catch (_) {}
      postIOPub(execId, { msg_type: 'status', execution_state: 'idle' });
    }
  }
};
`

type Pending = {
  outputs: OutputRecord[]
  onIOPub?: (msg: IOPubMessage) => void
  resolve: (r: KernelResult) => void
}

export class PyodideKernel {
  readonly ready: Promise<void>
  private worker: Worker
  private pending = new Map<string, Pending>()
  private pendingComplete = new Map<string, (opts: CompletionItem[]) => void>()

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
      if (msg.type === 'ready') {
        onReady()
        return
      }
      if (msg.type === 'init_error') {
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
        applyIOPubToOutputs(p.outputs, iopub)
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
    }

    this.worker.onerror = (e) => onFail(e.message)

    // Resolve the pyodide base URL from the app's own origin so the worker
    // loads static files from the same host instead of an external CDN.
    const pyodideBaseUrl = new URL('./pyodide/', window.location.href).href
    const initMsg: WorkerInbound = {
      type: 'init',
      pyodideBaseUrl,
      pyodidePackageBaseUrl: getPyodidePackageBaseUrl(),
    }
    this.worker.postMessage(initMsg)
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

  dispose(): void {
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

/**
 * Folds a single IOPub message into a flat per-execution outputs list. This is
 * a minimal duplicate of the notebook-side {@link applyIOPub} so that
 * `KernelResult.outputs` (used by smoke tests and the cribl_search final pass)
 * stays a plain `OutputRecord[]`. The notebook page does not use this — it
 * applies messages directly via the reducer.
 */
function applyIOPubToOutputs(outputs: OutputRecord[], msg: IOPubMessage): void {
  if (msg.msg_type === 'stream') {
    if (msg.text.length === 0) return
    const last = outputs[outputs.length - 1]
    if (last && last.output_type === 'stream' && last.name === msg.name) {
      outputs[outputs.length - 1] = {
        output_type: 'stream',
        name: msg.name,
        text: last.text + msg.text,
      }
      return
    }
    outputs.push({ output_type: 'stream', name: msg.name, text: msg.text })
    return
  }
  if (msg.msg_type === 'display_data') {
    outputs.push({
      output_type: 'display_data',
      data: msg.data,
      metadata: msg.metadata,
      ...(msg.transient?.display_id ? { display_id: msg.transient.display_id } : {}),
    })
    return
  }
  if (msg.msg_type === 'execute_result') {
    outputs.push({
      output_type: 'execute_result',
      execution_count: msg.execution_count,
      data: msg.data,
      metadata: msg.metadata,
      ...(msg.transient?.display_id ? { display_id: msg.transient.display_id } : {}),
    })
    return
  }
  if (msg.msg_type === 'update_display_data') {
    const id = msg.transient.display_id
    for (let i = 0; i < outputs.length; i++) {
      const r = outputs[i]
      if (
        (r.output_type === 'display_data' || r.output_type === 'execute_result') &&
        r.display_id === id
      ) {
        outputs[i] = { ...r, data: msg.data, metadata: msg.metadata }
      }
    }
    return
  }
  if (msg.msg_type === 'error') {
    outputs.push({
      output_type: 'error',
      ename: msg.ename,
      evalue: msg.evalue,
      traceback: msg.traceback,
    })
    return
  }
  if (msg.msg_type === 'clear_output' && !msg.wait) {
    outputs.length = 0
    return
  }
  // status, clear_output(wait:true): no-ops here
}
