import {
  findFirstMagicHeaderLineIndex,
  lineExcludedFromMagicBody,
} from '@features/notebook/magicCellLines'
import { looksLikeJinjaTemplate } from '@features/notebook/jinjaTemplateHeuristic'

/**
 * Jupyter-style cell magic `%%cribl_search` (notebook-app convention; not IPython).
 * Leading empty lines and full-line `#` comments are skipped before the magic line.
 * The query body omits full-line `#` lines; blank lines are kept.
 * First line:
 * %%cribl_search [var=name] [preview=true|false] [response=dataframe|json|raw] [limit=N] [earliest=…] [latest=…]
 * [lang=kql|kusto|english] [dataset=name] [template=auto|on|off|true|false] [translate_only=true|false]
 * Following lines: query body (KQL when `lang=kql|kusto`, natural language when `lang=english`).
 *
 * `translate_only=true` (with `lang=english`): translate the body to KQL and print it; do not run Search.
 * Omit or set `translate_only=false` to keep the default translate-and-run behavior for English.
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
 *
 * `template=auto` (default): if the body looks like Jinja (`{{`, `{%`, `{#`), the query
 * is rendered in the Pyodide kernel (Jinja2) so `{{ my_var }}` can embed notebook
 * variables. `template=on` always runs Jinja; `template=off` never does.
 */

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** How `%%cribl_search` decides to run a Jinja template pass in the kernel. */
export type CriblSearchTemplateMode = 'auto' | 'on' | 'off'

/** Default pandas DataFrame name for `%%cribl_search` when `var=` is omitted. */
export const DEFAULT_CRIBL_SEARCH_DATAFRAME_VAR = 'results_df'

export type CriblSearchMagicOk = {
  varName: string
  preview: boolean
  /** How results are surfaced in cell output. */
  response: 'dataframe' | 'json' | 'raw'
  /**
   * Query language mode.
   * - `kql` (default): body is sent directly to Search API
   * - `english`: body is translated to KQL first
   */
  lang: 'kql' | 'english'
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
  /** Optional dataset hint for NL->KQL translation (e.g. `cribl_search_sample`). */
  dataset?: string
  /**
   * `auto` (default): Jinja when the body contains `{{`, `{%`, or `{#`.
   * `on`: always run Jinja. `off`: never (body is always literal for Search).
   */
  template: CriblSearchTemplateMode
  /**
   * When true with `lang=english`, only translate to KQL (stdout + summary UI); skip Search execution.
   */
  translateOnly: boolean
}

export type CriblSearchMagicParse =
  | { kind: 'cribl_search'; value: CriblSearchMagicOk }
  | { kind: 'error'; message: string }
  | { kind: 'none' }

function parseKeyValueParams(paramLine: string):
  | {
      ok: true
      varName: string
      preview: boolean
      response: 'dataframe' | 'json' | 'raw'
      lang: 'kql' | 'english'
      limit: number
      earliest?: string
      latest?: string
      dataset?: string
      template: CriblSearchTemplateMode
      translateOnly: boolean
    }
  | { ok: false; message: string } {
  let varName = DEFAULT_CRIBL_SEARCH_DATAFRAME_VAR
  let preview = true
  let response: 'dataframe' | 'json' | 'raw' = 'dataframe'
  let lang: 'kql' | 'english' = 'kql'
  let limit = 0
  let earliest: string | undefined
  let latest: string | undefined
  let dataset: string | undefined
  let template: CriblSearchTemplateMode = 'auto'
  let translateOnly = false
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
      if (r === 'dataframe' || r === 'json' || r === 'raw') {
        response = r
      } else {
        return {
          ok: false,
          message: `response must be one of dataframe, json, raw; got ${JSON.stringify(val)}`,
        }
      }
    }
    if (key === 'earliest') earliest = val
    if (key === 'latest') latest = val
    if (key === 'dataset') dataset = val
    if (key === 'lang') {
      const l = val.toLowerCase()
      if (l === 'kql' || l === 'kusto') {
        lang = 'kql'
      } else if (l === 'english') {
        lang = 'english'
      } else {
        return {
          ok: false,
          message: `lang must be one of kql, kusto, english; got ${JSON.stringify(val)}`,
        }
      }
    }
    if (key === 'limit') {
      if (!/^\d+$/.test(val.trim())) {
        return { ok: false, message: `limit must be a non-negative integer, got ${JSON.stringify(val)}` }
      }
      const n = parseInt(val.trim(), 10)
      limit = n
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
        return {
          ok: false,
          message: `template must be one of auto, on, off; got ${JSON.stringify(val)}`,
        }
      }
    }
    if (key === 'translate_only') {
      const v = val.toLowerCase()
      if (v === 'true' || v === '1' || v === 'yes') {
        translateOnly = true
      } else if (v === 'false' || v === '0' || v === 'no') {
        translateOnly = false
      } else {
        return {
          ok: false,
          message: `translate_only must be true or false; got ${JSON.stringify(val)}`,
        }
      }
    }
  }
  return {
    ok: true,
    varName,
    preview,
    response,
    lang,
    limit,
    earliest,
    latest,
    dataset,
    template,
    translateOnly,
  }
}

/**
 * If the cell is a `%%cribl_search` magic cell, returns parsed parameters and query.
 * Otherwise returns `none`. Returns `error` when the magic header is present but invalid.
 */
export function parseCriblSearchMagic(source: string): CriblSearchMagicParse {
  const text = source.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIdx = findFirstMagicHeaderLineIndex(lines)
  if (headerIdx < 0) return { kind: 'none' }

  const firstLine = (lines[headerIdx] ?? '').trimStart().trimEnd()
  const mm = /^%%cribl_search(?:\s+(.*))?$/.exec(firstLine)
  if (!mm) return { kind: 'none' }

  const paramPart = mm[1]?.trim() ?? ''
  const parsed = parseKeyValueParams(paramPart)
  if (!parsed.ok) {
    return { kind: 'error', message: parsed.message }
  }
  const { varName, preview, response, lang, limit, earliest, latest, dataset, template, translateOnly } =
    parsed

  if (translateOnly && lang !== 'english') {
    return {
      kind: 'error',
      message: 'translate_only=true requires lang=english.',
    }
  }

  if (!IDENT_RE.test(varName)) {
    return {
      kind: 'error',
      message: `Invalid Python identifier for var: ${JSON.stringify(varName)}`,
    }
  }

  const query = lines
    .slice(headerIdx + 1)
    .filter((l) => !lineExcludedFromMagicBody(l))
    .join('\n')
    .replace(/\s+$/, '')
    .trim()

  if (!query) {
    return { kind: 'error', message: 'Missing query text after %%cribl_search line.' }
  }

  return {
    kind: 'cribl_search',
    value: {
      varName,
      preview,
      response,
      lang,
      limit,
      query,
      earliest,
      latest,
      dataset,
      template,
      translateOnly,
    },
  }
}

/** Heuristic: query body plausibly contains a Jinja construct (not a lone `{`). */
export function criblSearchQueryLooksLikeJinjaTemplate(query: string): boolean {
  return looksLikeJinjaTemplate(query)
}

/** Whether the kernel Jinja2 render pass should run (before Search / translate). */
export function wantsCriblSearchJinjaTemplating(
  query: string,
  mode: CriblSearchTemplateMode,
): boolean {
  if (mode === 'off') return false
  if (mode === 'on') return true
  return criblSearchQueryLooksLikeJinjaTemplate(query)
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
