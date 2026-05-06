/**
 * Jinja2 rendering in the Pyodide kernel (shared by `%%cribl_search`, `%%cribl_api`, and future cell magics).
 */
import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage, OutputRecord } from '@platform/pyodide/types'

export const JINJA_RESULT_KEY_CRIBL_SEARCH = '__cribl_search_rendered' as const
export const JINJA_RESULT_KEY_CRIBL_API = '__cribl_api_rendered' as const
export const JINJA_RESULT_KEY_RIPTIDE = '__riptide_prompt_rendered' as const

/** Kernel Jinja snippet variant: `riptide_prompt` adds `describe` / `type_name` filters for AI prompts. */
export type JinjaKernelVariant = 'plain' | 'riptide_prompt'

/**
 * Hides `execute_result` / `display_data` for a Jinja pre-execution helper cell.
 */
export function shouldSuppressJinjaPreExecuteIOPub(msg: IOPubMessage): boolean {
  if (msg.msg_type === 'execute_result') return true
  if (msg.msg_type === 'display_data') return true
  if (msg.msg_type === 'update_display_data') return true
  return false
}

/** @deprecated use {@link shouldSuppressJinjaPreExecuteIOPub} */
export function shouldSuppressCriblSearchJinjaRenderIOPub(msg: IOPubMessage): boolean {
  return shouldSuppressJinjaPreExecuteIOPub(msg)
}

/**
 * Read the Jinja output string from a helper cell's `execute_result` for a given
 * `resultKey` in the result dict.
 */
export function extractRenderedTextFromOutputs(
  outputs: readonly OutputRecord[],
  resultKey: string,
): string | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i]
    if (o.output_type !== 'execute_result') continue
    const jsonS = o.data['application/json']
    if (jsonS) {
      const parsed = tryParseJinjaJsonBundle(jsonS, resultKey)
      if (parsed != null) return parsed
    }
    const plain = o.data['text/plain']
    if (plain) {
      const fromPlain = tryParseJinjaTextPlain(plain, resultKey)
      if (fromPlain != null) return fromPlain
    }
  }
  return null
}

function tryParseJinjaJsonBundle(jsonS: string, resultKey: string): string | null {
  try {
    const v = JSON.parse(jsonS) as Record<string, unknown>
    const s = v[resultKey]
    if (typeof s === 'string') return s
  } catch {
    return null
  }
  return null
}

function tryParseJinjaTextPlain(plain: string, resultKey: string): string | null {
  const key = `'${resultKey}':`
  const idx = plain.indexOf(key)
  if (idx === -1) return null
  let p = idx + key.length
  while (p < plain.length && /\s/.test(plain[p]!)) p++
  const quote = plain[p]
  if (quote !== "'" && quote !== '"') return null
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
    if (c === quote) break
    out += c
    p += 1
  }
  if (p >= plain.length) return null
  return out
}

function encodeQueryForPythonB64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

export function buildNotebookJinjaRenderCode(
  text: string,
  resultKey: string,
  variant: JinjaKernelVariant = 'plain',
): string {
  const b64 = encodeQueryForPythonB64(text)
  const envBlock =
    variant === 'riptide_prompt'
      ? `    def _cribl_ai_type(o):
        try:
            return type(o).__name__
        except Exception:
            return "?"

    def _cribl_ai_describe(o):
        if o is None:
            return "None"
        try:
            import pandas as _pd
            if isinstance(o, _pd.DataFrame):
                _dt = o.dtypes.astype(str)
                return "DataFrame shape=%r columns=%d\\n%s" % (o.shape, len(o.columns), _dt.to_string())
        except Exception:
            pass
        try:
            if isinstance(o, dict):
                _k = list(o.keys())
                return "dict len=%d keys(sample)=%r" % (len(_k), _k[:30])
        except Exception:
            pass
        try:
            if isinstance(o, (list, tuple)):
                return "%s len=%d" % (type(o).__name__, len(o))
        except Exception:
            pass
        try:
            _r = repr(o)
            return _r if len(_r) <= 4000 else _r[:3997] + "..."
        except Exception as ex:
            return "<unprintable: %s>" % (ex,)

    _env = SandboxedEnvironment()
    _env.filters["describe"] = _cribl_ai_describe
    _env.filters["type_name"] = _cribl_ai_type
`
      : `    _env = SandboxedEnvironment()
`
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
${envBlock}    _ast = _env.parse(_tpl)
    _und = jinja2_meta.find_undeclared_variables(_ast)
    _g = globals()
    _ctx = {}
    for _n in _und:
        if _n not in _g:
            raise NameError("name " + repr(_n) + " is not defined")
        _ctx[_n] = _g[_n]
    return _env.from_string(_tpl).render(_ctx)

__cribl_s = await __cribl_jinja()
__cribl_k = {${JSON.stringify(resultKey)}: __cribl_s}
__cribl_k
`
}

export type NotebookJinjaInKernelResult =
  | { ok: true; text: string }
  | { ok: false; errorMessage: string }

export type RunNotebookJinjaInKernelOptions = {
  resultKey: string
  variant?: JinjaKernelVariant
  executionCount: number
  emitIOPub: (msg: IOPubMessage) => void
  filterPyodidePackageChatter: (text: string) => string
}

function formatJinjaKernelError(err: { evalue: string; ename: string; traceback: string[] }): string {
  const lines = [err.ename, err.evalue, ...err.traceback].filter(Boolean)
  return lines.join('\n').trim()
}

/**
 * Renders a Jinja template in the same Pyodide globals as the notebook, then
 * returns the rendered string. Suppresses display/execute_result IOPub; still
 * forwards filtered streams (e.g. micropip) and errors.
 */
export async function runNotebookJinjaInKernel(
  kernel: KernelPort,
  template: string,
  options: RunNotebookJinjaInKernelOptions,
): Promise<NotebookJinjaInKernelResult> {
  const {
    resultKey,
    variant = 'plain',
    executionCount,
    emitIOPub,
    filterPyodidePackageChatter: filter,
  } = options
  const code = buildNotebookJinjaRenderCode(template, resultKey, variant)
  const result = await kernel.execute(
    code,
    (msg) => {
      if (msg.msg_type === 'status' || msg.msg_type === 'clear_output') return
      if (shouldSuppressJinjaPreExecuteIOPub(msg)) return
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
    return { ok: false, errorMessage: formatJinjaKernelError(err) }
  }

  const text = extractRenderedTextFromOutputs(result.outputs, resultKey)
  if (text == null) {
    return { ok: false, errorMessage: 'Could not read the Jinja render result from the kernel.' }
  }
  return { ok: true, text }
}

/**
 * Renders a Riptide AI prompt with Jinja2 + introspection filters (`| describe`, `| type_name`).
 */
export async function runRiptidePromptJinjaInKernel(
  kernel: KernelPort,
  template: string,
  options: Omit<RunNotebookJinjaInKernelOptions, 'resultKey' | 'variant'>,
): Promise<NotebookJinjaInKernelResult> {
  return runNotebookJinjaInKernel(kernel, template, {
    ...options,
    resultKey: JINJA_RESULT_KEY_RIPTIDE,
    variant: 'riptide_prompt',
  })
}
