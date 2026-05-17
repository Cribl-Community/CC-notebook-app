import {
  CRIBL_SEARCH_DATAFRAME_CHUNK_ROWS,
  encodeRowsJsonForPythonBase64,
  buildCriblSearchDataframeCode,
} from '@features/cribl-search/criblSearchMagic'

/** Max rows passed into Pyodide for a Search DataFrame (browser + WASM limits). */
export const CRIBL_SEARCH_MAX_DATAFRAME_ROWS = 12_000

/** Max base64 payload per kernel.execute snippet (avoids huge compiled Python strings). */
export const CRIBL_SEARCH_MAX_CHUNK_B64_CHARS = 1_500_000

const MIN_CHUNK_ROWS = 50

export type CriblSearchDataframeHydrationPlan =
  | { kind: 'single'; code: string }
  | {
      kind: 'batched'
      initCode: string
      chunkCodes: string[]
      footerCode: string
    }

export function rowsForPythonHydration(
  rows: Record<string, unknown>[],
  totalRecords: number | null,
): {
  rowsToLoad: Record<string, unknown>[]
  loadedCount: number
  totalCount: number
  truncated: boolean
} {
  const totalCount = totalRecords ?? rows.length
  const maxLoad = Math.min(rows.length, CRIBL_SEARCH_MAX_DATAFRAME_ROWS)
  const rowsToLoad = rows.slice(0, maxLoad)
  return {
    rowsToLoad,
    loadedCount: rowsToLoad.length,
    totalCount: Math.max(totalCount, rows.length),
    truncated: rows.length > rowsToLoad.length || totalCount > rowsToLoad.length,
  }
}

/** Pick a chunk row count so each base64 blob stays under {@link CRIBL_SEARCH_MAX_CHUNK_B64_CHARS}. */
export function pickDataframeChunkRowCount(rows: Record<string, unknown>[]): number {
  if (rows.length === 0) return CRIBL_SEARCH_DATAFRAME_CHUNK_ROWS
  const sample = rows[0]
  const colCount = sample && typeof sample === 'object' ? Object.keys(sample).length : 8
  let n = colCount > 40 ? 150 : colCount > 20 ? 300 : CRIBL_SEARCH_DATAFRAME_CHUNK_ROWS
  n = Math.min(n, rows.length)
  while (n > MIN_CHUNK_ROWS) {
    const b64 = encodeRowsJsonForPythonBase64(rows.slice(0, n))
    if (b64.length <= CRIBL_SEARCH_MAX_CHUNK_B64_CHARS) return n
    n = Math.max(MIN_CHUNK_ROWS, Math.floor(n / 2))
  }
  return MIN_CHUNK_ROWS
}

function buildAppendChunkCode(varName: string, b64: string): string {
  return `__part = pd.DataFrame(json.loads(base64.standard_b64decode("""${b64}""".encode("ascii")).decode("utf-8")))
${varName} = pd.concat([${varName}, __part], ignore_index=True) if len(${varName}) else __part
del __part`
}

function buildFooterCode(
  varName: string,
  loadedCount: number,
  totalCount: number,
  truncated: boolean,
  preview: boolean,
): string {
  const lines = [
    `${varName}._search_rows_loaded = ${loadedCount}`,
    `${varName}._search_rows_total = ${totalCount}`,
  ]
  if (truncated) {
    lines.push(
      `print(f"Loaded {len(${varName}):,} of {${totalCount}:,} Search rows into ${varName} (Pyodide cap; use summarize/limit in KQL for full counts).")`,
    )
  } else {
    lines.push(`print(f"Loaded {len(${varName}):,} rows into ${varName}.")`)
  }
  if (preview) {
    lines.push(`print(${varName}.head(20).to_string())`)
  }
  return lines.join('\n')
}

/**
 * Build one-shot or batched Pyodide code to hydrate a DataFrame without exceeding JS/WASM array limits.
 */
export function planCriblSearchDataframeHydration(
  varName: string,
  rows: Record<string, unknown>[],
  totalRecords: number | null,
  preview: boolean,
): CriblSearchDataframeHydrationPlan {
  const { rowsToLoad, loadedCount, totalCount, truncated } = rowsForPythonHydration(rows, totalRecords)
  const chunkSize = pickDataframeChunkRowCount(rowsToLoad)

  if (rowsToLoad.length <= chunkSize && rowsToLoad.length <= 800) {
    const code = buildCriblSearchDataframeCode(varName, encodeRowsJsonForPythonBase64(rowsToLoad), false)
    const footer = buildFooterCode(varName, loadedCount, totalCount, truncated, preview)
    return { kind: 'single', code: `${code}\n${footer}` }
  }

  const initCode = `import base64
import json
import pandas as pd

${varName} = pd.DataFrame()`

  const chunkCodes: string[] = []
  for (let i = 0; i < rowsToLoad.length; i += chunkSize) {
    const slice = rowsToLoad.slice(i, i + chunkSize)
    chunkCodes.push(buildAppendChunkCode(varName, encodeRowsJsonForPythonBase64(slice)))
  }

  const footerCode = buildFooterCode(varName, loadedCount, totalCount, truncated, preview)
  return { kind: 'batched', initCode, chunkCodes, footerCode }
}
