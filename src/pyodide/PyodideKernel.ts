import type {
  CompletionItem,
  IOPubMessage,
  KernelResult,
  OutputRecord,
  WorkerInbound,
  WorkerOutbound,
} from './types'
import { PYODIDE_PACKAGE_BASE_URL, resolvePyodidePackageBaseUrl } from './pyodideVersion'
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

// === Fetch bridge ===========================================================
// Pyodide / micropip use the global \`fetch\` to talk to PyPI (metadata) and
// files.pythonhosted.org (wheels). When the kernel runs inside Cribl's
// sandboxed iframe, only the main-thread \`fetch\` is monkey-patched to route
// through the pack proxy ( /api/v1/p/<pack>/proxy/<host>/... with auth
// injected by the parent window). A blob Worker bypasses that and hits PyPI
// directly, which fails with "Failed to fetch" because the iframe has no
// connect-src for those origins.
//
// Strategy: forward every cross-origin \`fetch()\` to the main thread via
// postMessage, let it call the patched \`fetch\` there, and reconstruct a
// Response from the bytes/headers the main thread sends back. Same-origin
// requests (vendored wheels, the lock file, our own assets) keep going
// directly through the worker for speed.
const _origFetch = self.fetch.bind(self);
const _fetchPending = new Map();
let _fetchSeq = 0;

function _serializeHeaders(h) {
  if (!h) return {};
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const out = {};
    h.forEach(function(v, k) { out[k] = v; });
    return out;
  }
  if (Array.isArray(h)) {
    const out = {};
    for (let i = 0; i < h.length; i++) out[h[i][0]] = h[i][1];
    return out;
  }
  if (typeof h === 'object') return Object.assign({}, h);
  return {};
}

async function _normalizeBody(body) {
  if (body == null) return null;
  if (typeof body === 'string') return body;
  if (body instanceof ArrayBuffer) return body;
  if (ArrayBuffer.isView(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength);
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return await body.arrayBuffer();
  }
  // URLSearchParams / FormData / ReadableStream — best-effort.
  try { return String(body); } catch (_) { return null; }
}

self.fetch = async function(input, init) {
  let url;
  let opts = init || undefined;
  if (typeof input === 'string') {
    url = input;
  } else if (input && typeof input.url === 'string') {
    url = input.url;
    if (!opts) {
      opts = {
        method: input.method,
        headers: input.headers,
        body: input.body && input.method && input.method !== 'GET' && input.method !== 'HEAD'
          ? await input.clone().arrayBuffer()
          : undefined,
        credentials: input.credentials,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        cache: input.cache,
        mode: input.mode,
        integrity: input.integrity,
      };
    }
  } else {
    url = String(input);
  }

  let absUrl;
  try {
    absUrl = new URL(url, self.location && self.location.href).href;
  } catch (_) {
    absUrl = url;
  }

  const sameOrigin = (function() {
    try {
      const u = new URL(absUrl);
      return self.location && u.origin === self.location.origin;
    } catch (_) { return true; }
  })();

  if (sameOrigin) {
    return _origFetch(input, init);
  }

  const id = '__nbf_' + (++_fetchSeq);
  const fwdInit = {
    method: (opts && opts.method) || 'GET',
    headers: _serializeHeaders(opts && opts.headers),
    body: await _normalizeBody(opts && opts.body),
    credentials: opts && opts.credentials,
    redirect: opts && opts.redirect,
    referrer: opts && opts.referrer,
    referrerPolicy: opts && opts.referrerPolicy,
    cache: opts && opts.cache,
    mode: opts && opts.mode,
    integrity: opts && opts.integrity,
  };

  return new Promise(function(resolve, reject) {
    _fetchPending.set(id, { resolve: resolve, reject: reject });
    self.postMessage({ type: 'fetch_request', id: id, url: absUrl, init: fwdInit });
  });
};

self.onmessage = async function(e) {
  const msg = e.data;

  if (msg && msg.type === 'fetch_response') {
    const p = _fetchPending.get(msg.id);
    if (!p) return;
    _fetchPending.delete(msg.id);
    if (msg.error) {
      p.reject(new TypeError(msg.error));
    } else {
      const resp = new Response(msg.body || null, {
        status: msg.status || 0,
        statusText: msg.statusText || '',
        headers: msg.headers || {},
      });
      // \`Response\` ignores caller-supplied url; expose the proxied origin so
      // micropip's "redirected to .../json" diagnostics still make sense.
      try { Object.defineProperty(resp, 'url', { value: msg.url || '' }); } catch (_) {}
      p.resolve(resp);
    }
    return;
  }

  if (msg.type === 'init') {
    try {
      importScripts(msg.pyodideBaseUrl + 'pyodide.js');
      pyodide = await loadPyodide({
        indexURL: msg.pyodideBaseUrl,
        packageBaseUrl: msg.pyodidePackageBaseUrl,
        // Default lock is indexURL/pyodide-lock.json (full upstream index). Micropip
        // uses this lock to decide "in Pyodide repo" vs PyPI — must match packageBaseUrl
        // (trimmed vendored lock under ./pyodide/full/ when present).
        lockFileURL: new URL('pyodide-lock.json', msg.pyodidePackageBaseUrl).href,
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
      await pyodide.runPythonAsync('await _nb_run(_nb_source_code, _nb_exec_count)');
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

      if (msg.type === 'fetch_request') {
        void this.handleFetchRequest(msg.id, msg.url, msg.init)
        return
      }
    }

    this.worker.onerror = (e) => onFail(e.message)

    // Prefer same-origin vendored wheels when `vendor-pyodide-wheels` has run; else jsDelivr CDN.
    const worker = this.worker
    void (async () => {
      let pyodidePackageBaseUrl: string
      try {
        pyodidePackageBaseUrl = await resolvePyodidePackageBaseUrl()
      } catch {
        pyodidePackageBaseUrl = PYODIDE_PACKAGE_BASE_URL
      }
      const pyodideBaseUrl = new URL('./pyodide/', window.location.href).href
      const initMsg: WorkerInbound = {
        type: 'init',
        pyodideBaseUrl,
        pyodidePackageBaseUrl,
      }
      worker.postMessage(initMsg)
    })()
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

  /**
   * Bridge for the worker's cross-origin `fetch()` calls (micropip → PyPI,
   * jsDelivr fallback wheels, etc). The Cribl iframe patches the main-thread
   * `fetch` so external URLs are routed through `/api/v1/p/<pack>/proxy/...`
   * with auth injected by the parent window. Workers don't see that patch, so
   * they delegate up here and we hand back a serialised Response.
   */
  private async handleFetchRequest(
    id: string,
    url: string,
    init: import('./types').ForwardedFetchInit,
  ): Promise<void> {
    try {
      const fetchInit: RequestInit = {
        method: init.method,
        headers: init.headers,
        credentials: init.credentials,
        redirect: init.redirect,
        referrer: init.referrer,
        referrerPolicy: init.referrerPolicy,
        cache: init.cache,
        mode: init.mode,
        integrity: init.integrity,
      }
      if (init.body != null && init.method && init.method !== 'GET' && init.method !== 'HEAD') {
        fetchInit.body = init.body as BodyInit
      }
      const r = await fetch(url, fetchInit)
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
