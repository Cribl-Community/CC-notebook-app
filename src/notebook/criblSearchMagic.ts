/**
 * Jupyter-style cell magic `%%cribl_search` (notebook-app convention; not IPython).
 * First line: %%cribl_search [var=name] [preview=true|false]
 * Following lines: KQL query body.
 */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

export type CriblSearchMagicOk = {
  varName: string
  preview: boolean
  query: string
}

export type CriblSearchMagicParse =
  | { kind: 'cribl_search'; value: CriblSearchMagicOk }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

function parseKeyValueParams(paramLine: string): { varName: string; preview: boolean } {
  let varName = 'results_df'
  let preview = true
  const tokens = paramLine.trim().split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    const eq = t.indexOf('=')
    if (eq <= 0) continue
    const key = t.slice(0, eq).trim().toLowerCase()
    const val = t.slice(eq + 1).trim()
    if (key === 'var') varName = val
    if (key === 'preview') preview = val.toLowerCase() !== 'false'
  }
  return { varName, preview }
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
  const { varName, preview } = parseKeyValueParams(paramPart)

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
    value: { varName, preview, query },
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
