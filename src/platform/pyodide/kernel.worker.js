// Pyodide kernel web worker.
//
// Runs Python inside the browser. Loaded by PyodideKernel.ts as a classic
// worker via Blob URL because:
// - Cribl's sandboxed iframe disallows external importScripts, so Pyodide is
//   served from `public/pyodide/` on the app's own origin.
// - The main thread passes the pyodide base URL (and other runtime config)
//   through the first `init` message rather than hard-coding a CDN.
//
// Two Python bootstrap sources are injected at load time by replacing the
// quoted string placeholders defined below. They live as `?raw` imports in
// PyodideKernel.ts so they are type-checked and bundled with the worker source.
/* eslint-disable no-var */

let pyodide = null
const COMPLETION_PY = '__NB_COMPLETION_PY__'
const IOPUB_BOOTSTRAP_PY = '__NB_IOPUB_BOOTSTRAP_PY__'

function postIOPub(execId, msg) {
  self.postMessage({ type: 'iopub', id: execId, msg: msg })
}

// === Fetch bridge ===========================================================
// Pyodide / micropip use the global `fetch` to talk to PyPI (metadata) and
// files.pythonhosted.org (wheels). When the kernel runs inside Cribl's
// sandboxed iframe, only the main-thread `fetch` is monkey-patched to route
// through the pack proxy ( /api/v1/p/<pack>/proxy/<host>/... with auth
// injected by the parent window). A blob Worker bypasses that and hits PyPI
// directly, which fails with "Failed to fetch" because the iframe has no
// connect-src for those origins.
//
// Strategy: forward every cross-origin `fetch()` to the main thread via
// postMessage, let it call the patched `fetch` there, and reconstruct a
// Response from the bytes/headers the main thread sends back. Same-origin
// requests for the `public/pyodide/` tree *also* go to the main thread so
// `packageFetchCache` can dedupe across multiple notebook kernels. Other
// same-origin fetches use the native worker `fetch` for speed.
const _origFetch = self.fetch.bind(self)
const _fetchPending = new Map()
let _fetchSeq = 0
/** App document origin from the main thread (reliable in blob workers; avoids self.location quirks). */
let _appOrigin = ''
/** `getSameOriginPyodideBaseUrl()` (from init). Used to route pyodide assets to the main-thread cache. */
let _appPyodideBaseUrl = ''

/**
 * @param {string} absUrl
 * @param {string} appPyodideBaseUrl
 */
function _isAppPyodideAssetUrl(absUrl, appPyodideBaseUrl) {
  if (!appPyodideBaseUrl) {
    return false
  }
  try {
    var u = new URL(absUrl)
    var b = new URL(appPyodideBaseUrl)
    if (u.origin !== b.origin) {
      return false
    }
    var p = b.pathname
    var childPrefix = p.charAt(p.length - 1) === '/' ? p : p + '/'
    return u.pathname === p || u.pathname.startsWith(childPrefix)
  } catch (_) {
    return false
  }
}

/**
 * True when this request targets the app API surface (`/api/v1/...`) on the
 * same origin. These calls must go through the main-thread fetch bridge so the
 * Cribl iframe fetch patch can inject auth and apply proxy rewriting.
 *
 * NOTE: Direct worker fetches for these URLs can fail in sandboxed contexts
 * (`Origin: null`) and are not equivalent to the main-thread patched fetch.
 *
 * @param {string} absUrl
 */
function _isAppApiUrl(absUrl) {
  try {
    var u = new URL(absUrl)
    if (_appOrigin && u.origin !== _appOrigin) {
      return false
    }
    return u.pathname === '/api/v1' || u.pathname.startsWith('/api/v1/')
  } catch (_) {
    return false
  }
}

// Pyodide's pyfetch (0.29.x) checks the Service Worker Cache API before making
// real network requests.  In a sandboxed iframe without the allow-same-origin
// flag, accessing `self.caches` throws a SecurityError which pyfetch wraps as
// AbortError — and that propagates all the way up to micropip as
// "Can't fetch metadata for '...'".  Pre-emptively replace caches with a no-op
// stub so pyfetch always gets a cache-miss and falls through to the actual fetch.
;(function _polyfillCaches() {
  var hasCaches = false
  try {
    hasCaches = typeof self.caches !== 'undefined' && !!self.caches
  } catch (_) {
    /* ignore */
  }
  if (!hasCaches) {
    var _noopCache = {
      match: function () {
        return Promise.resolve(undefined)
      },
      put: function () {
        return Promise.resolve()
      },
      delete: function () {
        return Promise.resolve(false)
      },
      keys: function () {
        return Promise.resolve([])
      },
      addAll: function () {
        return Promise.resolve()
      },
      add: function () {
        return Promise.resolve()
      },
    }
    try {
      Object.defineProperty(self, 'caches', {
        configurable: true,
        enumerable: false,
        value: {
          open: function () {
            return Promise.resolve(_noopCache)
          },
          match: function () {
            return Promise.resolve(undefined)
          },
          has: function () {
            return Promise.resolve(false)
          },
          delete: function () {
            return Promise.resolve(false)
          },
          keys: function () {
            return Promise.resolve([])
          },
        },
      })
    } catch (_) {
      /* ignore */
    }
  }
})()

function _serializeHeaders(h) {
  if (!h) return {}
  if (typeof Headers !== 'undefined' && h instanceof Headers) {
    const out = {}
    h.forEach(function (v, k) {
      out[k] = v
    })
    return out
  }
  if (Array.isArray(h)) {
    const out = {}
    for (let i = 0; i < h.length; i++) out[h[i][0]] = h[i][1]
    return out
  }
  if (typeof h === 'object') return Object.assign({}, h)
  return {}
}

async function _normalizeBody(body) {
  if (body == null) return null
  if (typeof body === 'string') return body
  if (body instanceof ArrayBuffer) return body
  if (ArrayBuffer.isView(body)) {
    return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return await body.arrayBuffer()
  }
  // URLSearchParams / FormData / ReadableStream — best-effort.
  try {
    return String(body)
  } catch (_) {
    return null
  }
}

self.fetch = async function (input, init) {
  let url
  let opts = init || undefined
  if (typeof input === 'string') {
    url = input
  } else if (input && typeof input.url === 'string') {
    url = input.url
    if (!opts) {
      opts = {
        method: input.method,
        headers: input.headers,
        body:
          input.body && input.method && input.method !== 'GET' && input.method !== 'HEAD'
            ? await input.clone().arrayBuffer()
            : undefined,
        credentials: input.credentials,
        redirect: input.redirect,
        referrer: input.referrer,
        referrerPolicy: input.referrerPolicy,
        cache: input.cache,
        mode: input.mode,
        integrity: input.integrity,
      }
    }
  } else {
    url = String(input)
  }

  let absUrl
  try {
    absUrl = new URL(url, self.location && self.location.href).href
  } catch (_) {
    absUrl = url
  }

  const sameOrigin = (function () {
    try {
      const u = new URL(absUrl)
      if (_appOrigin) {
        return u.origin === _appOrigin
      }
      return Boolean(self.location && u.origin === self.location.origin)
    } catch (_) {
      return false
    }
  })()

  // Cross-origin, app-hosted /pyodide/ lazy loads, and app API calls should
  // use main-thread `fetch` + `packageFetchCache`. Keep native worker fetch
  // only for other same-origin URLs.
  if (
    sameOrigin &&
    !_isAppPyodideAssetUrl(absUrl, _appPyodideBaseUrl) &&
    !_isAppApiUrl(absUrl)
  ) {
    return _origFetch(input, init)
  }

  const id = '__nbf_' + ++_fetchSeq
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
  }

  return new Promise(function (resolve, reject) {
    _fetchPending.set(id, { resolve: resolve, reject: reject })
    self.postMessage({ type: 'fetch_request', id: id, url: absUrl, init: fwdInit })
  })
}

self.onmessage = async function (e) {
  const msg = e.data

  if (msg && msg.type === 'fetch_response') {
    const p = _fetchPending.get(msg.id)
    if (!p) return
    _fetchPending.delete(msg.id)
    if (msg.error) {
      p.reject(new TypeError(msg.error))
    } else {
      const resp = new Response(msg.body || null, {
        status: msg.status || 0,
        statusText: msg.statusText || '',
        headers: msg.headers || {},
      })
      // `Response` ignores caller-supplied url; expose the proxied origin so
      // micropip's "redirected to .../json" diagnostics still make sense.
      try {
        Object.defineProperty(resp, 'url', { value: msg.url || '' })
      } catch (_) {
        /* ignore */
      }
      p.resolve(resp)
    }
    return
  }

  if (msg.type === 'init') {
    _appOrigin = msg.appOrigin || ''
    _appPyodideBaseUrl = (msg.pyodideBaseUrl && String(msg.pyodideBaseUrl)) || ''
    var criblApiUrl = (msg.criblApiUrl && String(msg.criblApiUrl).trim()) || ''
    try {
      importScripts(msg.pyodideBaseUrl + 'pyodide.js')
      pyodide = await loadPyodide({
        indexURL: msg.pyodideBaseUrl,
        packageBaseUrl: msg.pyodidePackageBaseUrl,
        // Same-origin lock from the shipped `public/pyodide/` tree; avoids CSP blocks on jsDelivr in iframes.
        lockFileURL: msg.pyodideLockFileUrl,
      })
      await pyodide.runPythonAsync(
        'import os\nos.environ["CRIBL_API_URL"] = ' + JSON.stringify(criblApiUrl),
      )
      await pyodide.runPythonAsync(COMPLETION_PY)
      await pyodide.loadPackagesFromImports(IOPUB_BOOTSTRAP_PY)
      await pyodide.runPythonAsync(IOPUB_BOOTSTRAP_PY)
      self.postMessage({ type: 'ready' })
    } catch (err) {
      self.postMessage({ type: 'init_error', message: err.message })
    }
    return
  }

  if (msg.type === 'complete') {
    if (!pyodide) return
    const id = msg.id
    try {
      await pyodide.loadPackagesFromImports('import jedi\n')
      pyodide.globals.set('_nb_code', msg.code)
      pyodide.globals.set('_nb_cursor', msg.cursor)
      const jsonStr = await pyodide.runPythonAsync('_notebook_complete_json(_nb_code, _nb_cursor)')
      const options = JSON.parse(jsonStr)
      self.postMessage({ type: 'complete_result', id: id, options: options })
    } catch (_err) {
      self.postMessage({ type: 'complete_result', id: id, options: [] })
    }
    return
  }

  if (msg.type === 'exec') {
    if (!pyodide) return
    const execId = msg.id
    const execCount = msg.execution_count | 0

    // Install the IOPub bridge for this execution. Python calls _NB_IOPUB(dict)
    // which lands here as a PyProxy → plain JS object.
    const bridge = (pyMsg) => {
      let plain
      try {
        plain =
          pyMsg && typeof pyMsg.toJs === 'function'
            ? pyMsg.toJs({ dict_converter: Object.fromEntries })
            : pyMsg
      } catch (_) {
        plain = pyMsg
      } finally {
        try {
          pyMsg && pyMsg.destroy && pyMsg.destroy()
        } catch (_) {
          /* ignore */
        }
      }
      try {
        postIOPub(execId, plain)
      } catch (err) {
        // Last-ditch: forward as a stream stderr message.
        try {
          postIOPub(execId, {
            msg_type: 'stream',
            name: 'stderr',
            text: String(err && err.message ? err.message : err) + '\n',
          })
        } catch (_) {
          /* ignore */
        }
      }
    }

    pyodide.globals.set('_NB_IOPUB', bridge)

    postIOPub(execId, { msg_type: 'status', execution_state: 'busy' })
    try {
      // Load any imported packages BEFORE installing the user-facing stdout/stderr
      // hooks, so package loader chatter ("Loading X", "Loaded X") does not leak
      // into cell output.
      await pyodide.loadPackagesFromImports(msg.code)

      pyodide.setStdout({
        batched: function (text) {
          postIOPub(execId, { msg_type: 'stream', name: 'stdout', text: text })
        },
      })
      pyodide.setStderr({
        batched: function (text) {
          postIOPub(execId, { msg_type: 'stream', name: 'stderr', text: text })
        },
      })

      pyodide.globals.set('_nb_source_code', msg.code)
      pyodide.globals.set('_nb_exec_count', execCount)
      await pyodide.runPythonAsync('await _nb_run(_nb_source_code, _nb_exec_count)')
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      const lines = message.split('\n')
      const nonEmpty = lines.filter(function (l) {
        return l.trim().length > 0
      })
      const lastLine = nonEmpty.length > 0 ? nonEmpty[nonEmpty.length - 1] : ''
      const colonIdx = lastLine.indexOf(': ')
      const ename = colonIdx > 0 ? lastLine.slice(0, colonIdx) : 'Error'
      const evalue = colonIdx > 0 ? lastLine.slice(colonIdx + 2) : lastLine
      postIOPub(execId, {
        msg_type: 'error',
        ename: ename,
        evalue: evalue,
        traceback: lines,
      })
    } finally {
      try {
        pyodide.globals.set('_NB_IOPUB', null)
      } catch (_) {
        /* ignore */
      }
      try {
        pyodide.setStdout({})
      } catch (_) {
        /* ignore */
      }
      try {
        pyodide.setStderr({})
      } catch (_) {
        /* ignore */
      }
      postIOPub(execId, { msg_type: 'status', execution_state: 'idle' })
    }
  }
}
