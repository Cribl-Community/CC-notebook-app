import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage, OutputRecord } from '@platform/pyodide/types'

const RESULT_KEY = '__cribl_search_rendered' as const

/**
 * Hides `execute_result` / `display_data` for the Jinja "pre-execute" so the cell
 * only shows the main `%%cribl_search` stream + table, not a duplicate Out[].
 * {@link import('@platform/pyodide/PyodideKernel').PyodideKernel#execute} still
 * appends the full record list to `KernelResult.outputs` for host-side parse.
 */
export function shouldSuppressCriblSearchJinjaRenderIOPub(msg: IOPubMessage): boolean {
  if (msg.msg_type === 'execute_result') return true
  if (msg.msg_type === 'display_data') return true
  if (msg.msg_type === 'update_display_data') return true
  return false
}

/**
 * Read the expanded query from the Jinja helper cell's `execute_result`
 * (typically `data['application/json']` for the result dict from IPython).
 */
export function extractCriblSearchRenderedQueryFromOutputs(
  outputs: readonly OutputRecord[],
): string | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i]
    if (o.output_type !== 'execute_result') continue
    const jsonS = o.data['application/json']
    if (jsonS) {
      const parsed = tryParseCriblSearchJinjaJsonBundle(jsonS)
      if (parsed != null) return parsed
    }
    const plain = o.data['text/plain']
    if (plain) {
      const fromPlain = tryParseCriblSearchJinjaTextPlain(plain)
      if (fromPlain != null) return fromPlain
    }
  }
  return null
}

function tryParseCriblSearchJinjaJsonBundle(jsonS: string): string | null {
  try {
    const v = JSON.parse(jsonS) as Record<string, unknown>
    const s = v[RESULT_KEY]
    if (typeof s === 'string') return s
  } catch {
    return null
  }
  return null
}

/**
 * When `application/json` is missing, IPython may only emit
 * `text/plain` = `repr(dict)`; best-effort parse of `{'__cribl_search_rendered': '...'}`.
 */
function tryParseCriblSearchJinjaTextPlain(plain: string): string | null {
  const key = `'${RESULT_KEY}':`
  const idx = plain.indexOf(key)
  if (idx === -1) return null
  // repr uses single-quoted str; keep minimal: find opening quote after key, walk escapes.
  let p = idx + key.length
  while (p < plain.length && /\s/.test(plain[p]!)) p++
  if (plain[p] !== "'") return null
  p += 1
  let out = ''
  while (p < plain.length) {
    const c = plain[p]!
    if (c === '\\' && p + 1 < plain.length) {
      const n = plain[p + 1]!
      if (n === 'n') {
        out += '\n'
        p += 2
        continue
      }
      if (n === 't') {
        out += '\t'
        p += 2
        continue
      }
      if (n === 'r') {
        out += '\r'
        p += 2
        continue
      }
      if (n === '\\' || n === "'" || n === '"') {
        out += n
        p += 2
        continue
      }
    }
    if (c === "'") break
    out += c
    p += 1
  }
  if (p >= plain.length) return null
  return out
}

/** UTF-8 string → base64, embedding-safe for Python one-line string literals. */
function encodeQueryForPythonB64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

/**
 * Async Pyodide cell: ensures Jinja2, SandboxedEnvironment, reads only undeclared
 * variable names from `globals()`, renders the template, returns
 * `{"__cribl_search_rendered": s}` with trailing `__cribl_k` re-display for async cells.
 */
export function buildCriblSearchJinjaRenderCode(text: string): string {
  const b64 = encodeQueryForPythonB64(text)
  // Unique-ish names: avoid clashing with user "from __cribl_ import" etc.
  return `import base64 as __b64j

async def __cribl_jinja():
    try:
        import jinja2
    except ModuleNotFoundError:
        import micropip
        await micropip.install("jinja2")
        import jinja2
    from jinja2.sandbox import SandboxedEnvironment
    from jinja2 import meta as jinja2_meta

    _b64s = ${JSON.stringify(b64)}
    _tpl = __b64j.b64decode(_b64s.encode("ascii")).decode("utf-8")
    _env = SandboxedEnvironment()
    _ast = _env.parse(_tpl)
    _und = jinja2_meta.find_undeclared_variables(_ast)
    _g = globals()
    _ctx = {}
    for _n in _und:
        if _n not in _g:
            raise NameError("name " + repr(_n) + " is not defined")
        _ctx[_n] = _g[_n]
    return _env.from_string(_tpl).render(_ctx)

__cribl_s = await __cribl_jinja()
__cribl_k = {${JSON.stringify(RESULT_KEY)}: __cribl_s}
__cribl_k
`
}

export type CriblSearchJinjaInKernelResult =
  | { ok: true; text: string }
  | { ok: false; errorMessage: string }

/**
 * Runs the Jinja render in the same Pyodide globals as the notebook, then
 * returns the final query string. Suppresses display/execute_result IOPub;
 * still forwards filtered streams (e.g. micropip) and errors.
 */
export async function runCriblSearchJinjaInKernel(
  kernel: KernelPort,
  query: string,
  options: {
    /** Use 0 to avoid a prominent Out[n] in metadata when render IOPub is suppressed. */
    executionCount: number
    emitIOPub: (msg: IOPubMessage) => void
    filterPyodidePackageChatter: (text: string) => string
  },
): Promise<CriblSearchJinjaInKernelResult> {
  const { executionCount, emitIOPub, filterPyodidePackageChatter: filter } = options
  const code = buildCriblSearchJinjaRenderCode(query)
  const result = await kernel.execute(
    code,
    (msg) => {
      if (msg.msg_type === 'status' || msg.msg_type === 'clear_output') return
      if (shouldSuppressCriblSearchJinjaRenderIOPub(msg)) return
      if (msg.msg_type === 'stream') {
        const t = filter(msg.text)
        if (t.length === 0) return
        emitIOPub({ ...msg, text: t })
        return
      }
      emitIOPub(msg)
    },
    executionCount,
  )

  const err = result.outputs.find(
    (o) => o.output_type === 'error',
  ) as
    | { output_type: 'error'; evalue: string; ename: string; traceback: string[] }
    | undefined
  if (err) {
    return {
      ok: false,
      errorMessage: formatJinjaKernelError(err),
    }
  }

  const text = extractCriblSearchRenderedQueryFromOutputs(result.outputs)
  if (text == null) {
    return { ok: false, errorMessage: 'Could not read the rendered search query from the kernel.' }
  }
  return { ok: true, text }
}

function formatJinjaKernelError(err: {
  evalue: string
  ename: string
  traceback: string[]
}): string {
  const lines = [err.ename, err.evalue, ...err.traceback].filter(Boolean)
  return lines.join('\n').trim()
}
