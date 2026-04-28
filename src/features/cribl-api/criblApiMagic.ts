/**
 * Jupyter-style cell magic `%%cribl_api` (notebook-app convention; not IPython).
 * Leading empty lines and full-line `#` comments are skipped before the magic line.
 * The YAML body omits full-line `#` lines; blank lines are kept.
 * First line:
 * %%cribl_api <METHOD> <path> [var=name] [preview=true|false] [response=json|raw|text] [template=auto|on|off|true|false]
 * Following lines: YAML mapping for `headers`, `json` (object → JSON request body), and optional `body` (string,
 * used when `json` is not set; if both are set, `json` takes precedence for the serialized body).
 *
 * `var=` sets the Python name for the response value (default `cribl_api_result`).
 * `response`: how to treat the **HTTP** response body — `json` parses JSON into a Python `dict`/`list`;
 * `raw` and `text` assign the body as a UTF-8 string.
 *
 * `template=auto` (default): if the YAML block contains Jinja (`{{`, `{%`, `{#`), the block is
 * rendered in the Pyodide kernel before YAML parsing, same as `%%cribl_search`.
 */

import { parse as parseYaml } from 'yaml'

import {
  findFirstMagicHeaderLineIndex,
  lineExcludedFromMagicBody,
} from '@features/notebook/magicCellLines'

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])
const RESULT_FIRST_LINE = /^%%cribl_api(?:\s+(.*))?$/

export const DEFAULT_CRIBL_API_VAR = 'cribl_api_result'

export type CriblApiTemplateMode = 'auto' | 'on' | 'off'

export type CriblApiResponseMode = 'json' | 'raw' | 'text'

export type CriblApiMagicOk = {
  method: string
  /** API path with leading slash, relative to `CRIBL_API_URL` (may include `?query`). */
  path: string
  varName: string
  preview: boolean
  response: CriblApiResponseMode
  /** Raw YAML / template block (lines after the first), trimmed. */
  yamlBlock: string
  template: CriblApiTemplateMode
}

export type CriblApiMagicParse =
  | { kind: 'cribl_api'; value: CriblApiMagicOk }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

export type CriblApiRequestParts = {
  headers: Record<string, string>
  body: string | undefined
  /** When true, the body is JSON; caller may set `Content-Type: application/json` if missing. */
  bodyIsJson: boolean
}

/**
 * `body` in YAML: optional raw string; ignored when `json` is set (per precedence rules).
 * `json` in YAML: becomes JSON request body. Unknown top-level keys are rejected to avoid
 * mistyped requests silently sending partial bodies.
 */
export function buildCriblApiRequestFromYamlObject(doc: unknown): CriblApiRequestParts {
  if (doc == null) {
    return { headers: {}, body: undefined, bodyIsJson: false }
  }
  if (typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('YAML for %%cribl_api must be a mapping (e.g. `headers:`, `json:`), not an array or plain string.')
  }
  const o = doc as Record<string, unknown>
  const known = new Set(['headers', 'json', 'body'])
  for (const k of Object.keys(o)) {
    if (!known.has(k)) {
      throw new Error(
        `Unknown key ${JSON.stringify(k)} in %%cribl_api YAML. Use only top-level "headers", "json", and "body".`,
      )
    }
  }
  const headers: Record<string, string> = {}
  if (o.headers !== undefined) {
    if (o.headers == null || typeof o.headers !== 'object' || Array.isArray(o.headers)) {
      throw new Error('YAML "headers" must be a string-keyed mapping.')
    }
    for (const [hk, hv] of Object.entries(o.headers as Record<string, unknown>)) {
      if (typeof hv === 'string' || typeof hv === 'number' || typeof hv === 'boolean') {
        headers[hk] = String(hv)
      } else {
        throw new Error(`Header ${JSON.stringify(hk)} value must be a string, number, or boolean.`)
      }
    }
  }

  if (o.json !== undefined) {
    const body = JSON.stringify(o.json)
    return { headers, body, bodyIsJson: true }
  }
  if (o.body !== undefined) {
    if (typeof o.body !== 'string') {
      throw new Error('YAML "body" must be a string when used without "json".')
    }
    return { headers, body: o.body, bodyIsJson: false }
  }
  return { headers, body: undefined, bodyIsJson: false }
}

/**
 * After optional Jinja, parse YAML to a request. Empty content yields no body and no extra headers.
 */
export function parseCriblApiYamlToRequest(yamlText: string): CriblApiRequestParts {
  const t = yamlText.replace(/^\uFEFF/, '').replace(/\s+$/, '')
  if (!t.trim()) {
    return { headers: {}, body: undefined, bodyIsJson: false }
  }
  let doc: unknown
  try {
    doc = parseYaml(t)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Invalid YAML: ${msg}`)
  }
  return buildCriblApiRequestFromYamlObject(doc)
}

function parseKeyValueParams(
  paramLine: string,
):
  | { ok: true; varName: string; preview: boolean; response: CriblApiResponseMode; template: CriblApiTemplateMode }
  | { ok: false; message: string } {
  let varName = DEFAULT_CRIBL_API_VAR
  let preview = true
  let response: CriblApiResponseMode = 'json'
  let template: CriblApiTemplateMode = 'auto'
  const tokens = paramLine.trim().split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'var') varName = val
    if (key === 'preview') preview = val.toLowerCase() !== 'false'
    if (key === 'response') {
      const r = val.toLowerCase()
      if (r === 'json' || r === 'raw' || r === 'text') {
        response = r
      } else {
        return { ok: false, message: `response must be one of json, raw, text; got ${JSON.stringify(val)}` }
      }
    }
    if (key === 'template') {
      const v = val.toLowerCase()
      if (v === 'auto') {
        template = 'auto'
      } else if (v === 'on' || v === 'true') {
        template = 'on'
      } else if (v === 'off' || v === 'false') {
        template = 'off'
      } else {
        return { ok: false, message: `template must be one of auto, on, off; got ${JSON.stringify(val)}` }
      }
    }
  }
  return { ok: true, varName, preview, response, template }
}

/**
 * If the cell is a `%%cribl_api` magic cell, returns parsed parameters and YAML / template block.
 * Otherwise returns `none`. Returns `error` when the magic header is present but invalid.
 */
export function parseCriblApiMagic(source: string): CriblApiMagicParse {
  const text = source.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIdx = findFirstMagicHeaderLineIndex(lines)
  if (headerIdx < 0) return { kind: 'none' }

  const firstLine = (lines[headerIdx] ?? '').trimStart().trimEnd()
  const mm = RESULT_FIRST_LINE.exec(firstLine)
  if (!mm) return { kind: 'none' }
  const rest = mm[1]?.trim() ?? ''
  if (!rest) {
    return { kind: 'error', message: '%%cribl_api requires a METHOD, path, and query parameters (e.g. GET /system/info).' }
  }
  const tokens = rest.split(/\s+/).filter(Boolean)
  if (tokens.length < 2) {
    return {
      kind: 'error',
      message: '%%cribl_api first line must be: %%cribl_api <METHOD> <path> [key=value ...]',
    }
  }
  const method = tokens[0]!.toUpperCase()
  if (!HTTP_METHODS.has(method)) {
    return { kind: 'error', message: `Unsupported HTTP method: ${JSON.stringify(tokens[0])}. Use GET, POST, PUT, PATCH, or DELETE.` }
  }
  const path = tokens[1]!
  if (!path.startsWith('/')) {
    return { kind: 'error', message: `API path must start with /, got ${JSON.stringify(path)}` }
  }
  const paramLine = tokens.slice(2).join(' ')
  const parsed = parseKeyValueParams(paramLine)
  if (!parsed.ok) {
    return { kind: 'error', message: parsed.message }
  }
  const { varName, preview, response, template } = parsed
  if (!IDENT_RE.test(varName)) {
    return { kind: 'error', message: `Invalid Python identifier for var: ${JSON.stringify(varName)}` }
  }
  const yamlBlock = lines
    .slice(headerIdx + 1)
    .filter((l) => !lineExcludedFromMagicBody(l))
    .join('\n')
    .replace(/\s+$/, '')

  return {
    kind: 'cribl_api',
    value: { method, path, varName, preview, response, yamlBlock, template },
  }
}

/** Heuristic: YAML / template plausibly contains a Jinja construct. */
export function criblApiBlockLooksLikeJinjaTemplate(block: string): boolean {
  if (block.includes('{{') || block.includes('{%') || block.includes('{#')) return true
  return false
}

export function wantsCriblApiJinjaTemplating(yamlBlock: string, mode: CriblApiTemplateMode): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return criblApiBlockLooksLikeJinjaTemplate(yamlBlock)
}

/** JSON response value (or any serializable) → base64 for embedding in generated Python. */
export function encodeValueJsonForPythonBase64(value: unknown): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(value === undefined ? null : value))))
}

/**
 * For UTF-8 response text (raw/text modes).
 */
export function encodeUtf8TextForPythonBase64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)))
}

/** Build Python to assign a parsed JSON value to `varName` from base64 JSON. */
export function buildCriblApiJsonValueAssignmentCode(varName: string, jsonValueBase64: string): string {
  return `import base64
import json

__j_b64 = """${jsonValueBase64}"""
${varName} = json.loads(base64.standard_b64decode(__j_b64.encode("ascii")).decode("utf-8"))`
}

/** Build Python to assign a UTF-8 string to `varName` from base64. */
export function buildCriblApiStringValueAssignmentCode(varName: string, utf8TextBase64: string): string {
  return `import base64

__s_b64 = """${utf8TextBase64}"""
${varName} = base64.standard_b64decode(__s_b64.encode("ascii")).decode("utf-8")`
}
