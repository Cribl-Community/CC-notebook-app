/**
 * Cell magics `%%cribl_save_search_lookup` and `%%cribl_load_search_lookup`.
 * Leading empty lines and full-line `#` comments are skipped before the magic line.
 *
 * Save (first line):
 * %%cribl_save_search_lookup <lookup_name.csv> [var=df] [replace=true|false] [mode=memory|disk] [group=default_search]
 *
 * Load (first line):
 * %%cribl_load_search_lookup <lookup_name.csv> [var=df] [group=default_search]
 *
 * No body lines are required. `var=` names the pandas DataFrame to read/write.
 */

import type { OutputRecord } from '@/domain/kernel'
import {
  findFirstMagicHeaderLineIndex,
  lineExcludedFromMagicBody,
} from '@features/notebook/magicCellLines'

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export const DEFAULT_CRIBL_LOOKUP_DATAFRAME_VAR = 'results_df'

/** `execute_result` JSON key holding `{ csv_b64, rows }` from the export helper cell. */
export const CRIBL_LOOKUP_EXPORT_RESULT_KEY = '__cribl_lookup_export__' as const

const SAVE_FIRST = /^%%cribl_save_search_lookup(?:\s+(.*))?$/
const LOAD_FIRST = /^%%cribl_load_search_lookup(?:\s+(.*))?$/

export type CriblSaveSearchLookupMagicOk = {
  lookupId: string
  varName: string
  replace: boolean
  mode: 'memory' | 'disk'
  group: string
}

export type CriblLoadSearchLookupMagicOk = {
  lookupId: string
  varName: string
  group: string
}

export type CriblSearchLookupMagicParse =
  | { kind: 'save'; value: CriblSaveSearchLookupMagicOk }
  | { kind: 'load'; value: CriblLoadSearchLookupMagicOk }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

function parseSaveParams(rest: string):
  | {
      ok: true
      lookupId: string
      varName: string
      replace: boolean
      mode: 'memory' | 'disk'
      group: string
    }
  | { ok: false; message: string } {
  const tokens = rest.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { ok: false, message: '%%cribl_save_search_lookup requires a lookup filename (e.g. my_table.csv).' }
  }
  const lookupId = tokens[0]!
  const paramTokens = tokens.slice(1)
  let varName = DEFAULT_CRIBL_LOOKUP_DATAFRAME_VAR
  let replace = false
  let mode: 'memory' | 'disk' = 'memory'
  let group = 'default_search'
  for (const t of paramTokens) {
    const eq = t.indexOf('=')
    if (eq <= 0) {
      return { ok: false, message: `Unexpected token ${JSON.stringify(t)} after lookup name.` }
    }
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'var') varName = val
    else if (key === 'replace') replace = val.toLowerCase() === 'true'
    else if (key === 'mode') {
      const m = val.toLowerCase()
      if (m === 'memory' || m === 'disk') mode = m
      else return { ok: false, message: `mode= must be memory or disk, not ${JSON.stringify(val)}.` }
    } else if (key === 'group') group = val
    else return { ok: false, message: `Unknown parameter ${JSON.stringify(key)}.` }
  }
  if (!IDENT_RE.test(varName)) {
    return { ok: false, message: `Invalid Python identifier for var: ${JSON.stringify(varName)}` }
  }
  if (!group.trim()) {
    return { ok: false, message: 'group= must be non-empty when set.' }
  }
  return { ok: true, lookupId, varName, replace, mode, group }
}

function parseLoadParams(rest: string):
  | { ok: true; lookupId: string; varName: string; group: string }
  | { ok: false; message: string } {
  const tokens = rest.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) {
    return { ok: false, message: '%%cribl_load_search_lookup requires a lookup filename (e.g. my_table.csv).' }
  }
  const lookupId = tokens[0]!
  const paramTokens = tokens.slice(1)
  let varName = DEFAULT_CRIBL_LOOKUP_DATAFRAME_VAR
  let group = 'default_search'
  for (const t of paramTokens) {
    const eq = t.indexOf('=')
    if (eq <= 0) {
      return { ok: false, message: `Unexpected token ${JSON.stringify(t)} after lookup name.` }
    }
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'var') varName = val
    else if (key === 'group') group = val
    else return { ok: false, message: `Unknown parameter ${JSON.stringify(key)}.` }
  }
  if (!IDENT_RE.test(varName)) {
    return { ok: false, message: `Invalid Python identifier for var: ${JSON.stringify(varName)}` }
  }
  if (!group.trim()) {
    return { ok: false, message: 'group= must be non-empty when set.' }
  }
  return { ok: true, lookupId, varName, group }
}

export function parseCriblSearchLookupMagic(source: string): CriblSearchLookupMagicParse {
  const text = source.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIdx = findFirstMagicHeaderLineIndex(lines)
  if (headerIdx < 0) return { kind: 'none' }

  const firstLine = (lines[headerIdx] ?? '').trimStart().trimEnd()
  const saveM = SAVE_FIRST.exec(firstLine)
  const loadM = LOAD_FIRST.exec(firstLine)
  if (!saveM && !loadM) {
    return { kind: 'none' }
  }

  const bodyLines = lines
    .slice(headerIdx + 1)
    .filter((l) => !lineExcludedFromMagicBody(l))
    .join('\n')
    .trim()
  if (bodyLines.length > 0) {
    return {
      kind: 'error',
      message: 'Lookup magics do not accept a body after the first line; remove trailing lines.',
    }
  }

  if (saveM) {
    const p = parseSaveParams(saveM[1]?.trim() ?? '')
    if (!p.ok) return { kind: 'error', message: p.message }
    return {
      kind: 'save',
      value: {
        lookupId: p.lookupId,
        varName: p.varName,
        replace: p.replace,
        mode: p.mode,
        group: p.group,
      },
    }
  }

  if (loadM) {
    const p = parseLoadParams(loadM[1]?.trim() ?? '')
    if (!p.ok) return { kind: 'error', message: p.message }
    return {
      kind: 'load',
      value: {
        lookupId: p.lookupId,
        varName: p.varName,
        group: p.group,
      },
    }
  }

  return { kind: 'none' }
}

function base64ToUtf8(b64: string): string {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new TextDecoder().decode(bytes)
}

export function extractLookupExportFromOutputs(
  outputs: readonly OutputRecord[],
): { csvUtf8: string; rows: number } | null {
  for (let i = outputs.length - 1; i >= 0; i--) {
    const o = outputs[i]
    if (o.output_type !== 'execute_result') continue
    const js = o.data['application/json']
    if (!js) continue
    try {
      const v = JSON.parse(js) as Record<string, unknown>
      const inner = v[CRIBL_LOOKUP_EXPORT_RESULT_KEY]
      if (!inner || typeof inner !== 'object') continue
      const rec = inner as { csv_b64?: unknown; rows?: unknown }
      if (typeof rec.csv_b64 !== 'string' || typeof rec.rows !== 'number') continue
      return { csvUtf8: base64ToUtf8(rec.csv_b64), rows: rec.rows }
    } catch {
      continue
    }
  }
  return null
}

/** UTF-8 safe string → base64 for embedding in generated Python. */
export function encodeUtf8ForPythonBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)))
}

/** Build kernel code that assigns `varName` from UTF-8 CSV held as base64 (from download). */
export function buildLookupLoadDataframeCode(varName: string, csvBase64: string): string {
  return `import base64
import io
import pandas as pd

__csv_b64 = """${csvBase64}"""
__raw = base64.standard_b64decode(__csv_b64.encode("ascii"))
${varName} = pd.read_csv(io.BytesIO(__raw))
print("Loaded " + str(len(${varName}.index)) + " rows into " + ${JSON.stringify(varName)})
`
}

/**
 * Serialize an existing pandas DataFrame to CSV and return a JSON bundle with
 * {@link CRIBL_LOOKUP_EXPORT_RESULT_KEY} for the host to read from `execute_result`.
 */
export function buildExportDataframeToLookupBundleCode(varName: string): string {
  const key = JSON.stringify(CRIBL_LOOKUP_EXPORT_RESULT_KEY)
  return `import base64
import pandas as pd

__df = ${varName}
if not isinstance(__df, pd.DataFrame):
    raise TypeError(${JSON.stringify(varName)} + " must be a pandas DataFrame, got " + type(__df).__name__)
__n = int(len(__df.index))
if __n > 10000:
    raise ValueError("Lookup export is limited to 10,000 rows (Cribl Search). Got " + str(__n))
__csv_bytes = __df.to_csv(index=False).encode("utf-8")
{ ${key}: {"csv_b64": base64.standard_b64encode(__csv_bytes).decode("ascii"), "rows": __n} }
`
}
