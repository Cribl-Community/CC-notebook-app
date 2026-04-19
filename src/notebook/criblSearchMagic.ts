/**
 * Jupyter-style cell magic `%%cribl_search` (notebook-app convention; not IPython).
 * First line: %%cribl_search [var=name] [preview=true|false] [limit=N] [earliest=…] [latest=…]
 * Following lines: KQL query body.
 *
 * `earliest` / `latest` are passed to the Cribl Search job API (defaults in the client if omitted).
 *
 * `limit`: max rows to load into the DataFrame (`0` = all rows returned by the job, paginating the
 * results API as needed). Defaults to `0`.
 *
 * Search rows are always loaded into a pandas DataFrame in the kernel. Use `var=` to set the name;
 * otherwise `DEFAULT_CRIBL_SEARCH_DATAFRAME_VAR` (`results_df`) is used.
 *
 * `preview`: when true (default), shows the result table in the cell output. When false,
 * the table is hidden (metadata lines still show). The DataFrame is always populated in
 * the named variable; pandas text preview is not printed (the table is the preview).
 */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** Default pandas DataFrame name for `%%cribl_search` when `var=` is omitted. */
export const DEFAULT_CRIBL_SEARCH_DATAFRAME_VAR = 'results_df'

export type CriblSearchMagicOk = {
  varName: string
  preview: boolean
  /**
   * Max rows to load into the kernel DataFrame. `0` means load every row the search returns
   * (iterate `/results` pages until exhausted).
   */
  limit: number
  query: string
  /** Passed to search job `earliest` when set (e.g. `-1h`, epoch, or ISO). */
  earliest?: string
  /** Passed to search job `latest` when set (e.g. `now`). */
  latest?: string
}

export type CriblSearchMagicParse =
  | { kind: 'cribl_search'; value: CriblSearchMagicOk }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

function parseKeyValueParams(paramLine: string):
  | { ok: true; varName: string; preview: boolean; limit: number; earliest?: string; latest?: string }
  | { ok: false; message: string } {
  let varName = DEFAULT_CRIBL_SEARCH_DATAFRAME_VAR
  let preview = true
  let limit = 0
  let earliest: string | undefined
  let latest: string | undefined
  const tokens = paramLine.trim().split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'var') varName = val
    if (key === 'preview') preview = val.toLowerCase() !== 'false'
    if (key === 'earliest') earliest = val
    if (key === 'latest') latest = val
    if (key === 'limit') {
      if (!/^\d+$/.test(val.trim())) {
        return { ok: false, message: `limit must be a non-negative integer, got ${JSON.stringify(val)}` }
      }
      const n = parseInt(val.trim(), 10)
      limit = n
    }
  }
  return { ok: true, varName, preview, limit, earliest, latest }
}

/**
 * If the cell is a `%%cribl_search` magic cell, returns parsed parameters and query.
 * Otherwise returns `none`. Returns `error` when the magic header is present but invalid.
 */
export function parseCriblSearchMagic(source: string): CriblSearchMagicParse {
  const text = source.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const firstLine = (lines[0] ?? '').trimStart().trimEnd()
  const mm = /^%%cribl_search(?:\s+(.*))?$/.exec(firstLine)
  if (!mm) return { kind: 'none' }

  const paramPart = mm[1]?.trim() ?? ''
  const parsed = parseKeyValueParams(paramPart)
  if (!parsed.ok) {
    return { kind: 'error', message: parsed.message }
  }
  const { varName, preview, limit, earliest, latest } = parsed

  if (!IDENT_RE.test(varName)) {
    return {
      kind: 'error',
      message: `Invalid Python identifier for var: ${JSON.stringify(varName)}`,
    }
  }

  const query = lines
    .slice(1)
    .join('\n')
    .replace(/\s+$/, '')
    .trim()

  if (!query) {
    return { kind: 'error', message: 'Missing KQL query after %%cribl_search line.' }
  }

  return {
    kind: 'cribl_search',
    value: { varName, preview, limit, query, earliest, latest },
  }
}

/** UTF-8 safe JSON → base64 for embedding in generated Python. */
export function encodeRowsJsonForPythonBase64(rows: Record<string, unknown>[]): string {
  return btoa(unescape(encodeURIComponent(JSON.stringify(rows))))
}

/** Base64 JSON rows → pandas DataFrame assignment + optional preview print. */
export function buildCriblSearchDataframeCode(
  varName: string,
  rowsJsonBase64: string,
  preview: boolean,
): string {
  const previewBlock = preview
    ? `

print(${varName}.head(20).to_string())
`
    : ''
  return `import base64
import json
import pandas as pd

__rows_b64 = """${rowsJsonBase64}"""
${varName} = pd.DataFrame(json.loads(base64.standard_b64decode(__rows_b64.encode("ascii")).decode("utf-8")))${previewBlock}`
}
