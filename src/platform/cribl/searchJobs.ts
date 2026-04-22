/**
 * Cribl Search jobs via REST (see AGENTS.md / CLAUDE.md — use group default_search).
 * Uses window fetch to CRIBL_API_URL so the platform proxy injects auth.
 */

import { getCriblApiBase } from '@platform/cribl/kvstore'
import { normalizeSearchQuery } from '@platform/cribl/searchQuery'
import { deriveColumnNames } from '@platform/cribl/searchResultModel'
import { runLocalSearchStub } from '@platform/cribl/searchStub'

export { normalizeSearchQuery } from '@platform/cribl/searchQuery'

const SEARCH_GROUP = 'default_search'
const POLL_MS = 450
const MAX_POLLS = 200

/** Default time window when `%%cribl_search` omits `earliest=` / `latest=`. */
export const DEFAULT_SEARCH_EARLIEST = '-1h'
export const DEFAULT_SEARCH_LATEST = 'now'

/** Max rows shown in the interactive result table (full DataFrame may be larger). */
export const DEFAULT_CRIBL_SEARCH_MAX_ROWS = 20

/** Rows per `/results` request when paginating (magic `limit=0` loads all pages). */
export const CRIBL_SEARCH_RESULTS_PAGE_SIZE = 5000

export type SearchProgressEvent = {
  /** 0–1 approximate progress for the job lifecycle */
  fraction: number
  label: string
}

export type CriblSearchJobResult = {
  rows: Record<string, unknown>[]
  /** Column names (union of keys across rows), sorted */
  columns: string[]
  /**
   * Total matching records when the API reports it (may exceed `rows.length`).
   * Otherwise null; callers can fall back to `rows.length`.
   */
  totalRecords: number | null
}

function searchBasePath(apiBase: string): string {
  return `${apiBase}/m/${SEARCH_GROUP}/search`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

const JSON_CLOSE: Record<string, string> = { '{': '}', '[': ']' }

/**
 * Returns the substring of `s` containing the first complete top-level JSON object or array,
 * or null if not found. Handles quoted strings so braces inside strings are ignored.
 */
export function extractFirstJsonValue(s: string): string | null {
  let i = 0
  while (i < s.length && /\s/.test(s[i]!)) i++
  if (i >= s.length) return null
  const c0 = s[i]!
  if (c0 !== '{' && c0 !== '[') return null
  const stack: string[] = [JSON_CLOSE[c0]!]
  let inString = false
  let escape = false
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j]!
    if (inString) {
      if (escape) {
        escape = false
      } else if (c === '\\') {
        escape = true
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      continue
    }
    if (c === '{' || c === '[') {
      stack.push(JSON_CLOSE[c]!)
      continue
    }
    if (c === '}' || c === ']') {
      if (stack.length === 0 || stack[stack.length - 1] !== c) return null
      stack.pop()
      if (stack.length === 0) {
        return s.slice(i, j + 1)
      }
    }
  }
  return null
}

/**
 * Parse a response body that should be JSON. Some proxies or APIs append extra JSON
 * documents or characters after the first value; `Response.json()` then fails with
 * "Unexpected non-whitespace character after JSON" and can surface ReadableStream errors.
 * Always use full-body text + this parser for search endpoints.
 */
export function parseLenientJsonResponseBody(text: string): unknown {
  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (!trimmed.length) {
    throw new Error('Empty JSON response body')
  }
  try {
    return JSON.parse(trimmed)
  } catch {
    const first = extractFirstJsonValue(trimmed)
    if (first !== null) {
      return JSON.parse(first)
    }
    throw new Error(`Invalid JSON response (first 240 chars): ${trimmed.slice(0, 240)}`)
  }
}

export async function readSearchResponseJson(res: Response): Promise<unknown> {
  const text = await res.text()
  return parseLenientJsonResponseBody(text)
}

function asJobIdString(v: unknown): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return null
}

/**
 * Cribl Search job create responses vary: top-level `id`, or `items[0].id`,
 * or Splunk-style `entry[0].content.sid` / `entry[0].name`.
 */
export function parseSearchJobCreateId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>

  const top =
    asJobIdString(o.id) ??
    asJobIdString(o.sid) ??
    asJobIdString(o.jobId) ??
    asJobIdString(o.job_id)
  if (top) return top

  const items = o.items
  if (Array.isArray(items) && items[0] && typeof items[0] === 'object') {
    const it = items[0] as Record<string, unknown>
    const fromItem =
      asJobIdString(it.id) ?? asJobIdString(it.sid) ?? asJobIdString(it.jobId) ?? asJobIdString(it.job_id)
    if (fromItem) return fromItem
  }

  const entry = o.entry
  if (Array.isArray(entry) && entry[0] && typeof entry[0] === 'object') {
    const e0 = entry[0] as Record<string, unknown>
    const content = e0.content
    if (content && typeof content === 'object') {
      const c = content as Record<string, unknown>
      const fromContent =
        asJobIdString(c.sid) ?? asJobIdString(c.id) ?? asJobIdString(c.job_id) ?? asJobIdString(c.jobId)
      if (fromContent) return fromContent
    }
    const fromEntry =
      asJobIdString(e0.id) ?? asJobIdString(e0.sid) ?? asJobIdString(e0.name) ?? asJobIdString(e0.title)
    if (fromEntry) return fromEntry
  }

  return null
}

function truthyCompleteFlag(v: unknown): boolean {
  return v === true || v === 'true' || v === 1 || v === '1'
}

/**
 * Derive job phase from Cribl / Splunk-style status payloads.
 * Cribl often nests state under `entry[0].content` (e.g. `isDone`, `sid`) while
 * Splunk-style APIs use `dispatchState` / `status` on the same objects.
 */
export function parseJobPhase(data: unknown): 'running' | 'completed' | 'failed' {
  if (!data || typeof data !== 'object') return 'running'
  const o = data as Record<string, unknown>

  const recordLayers: Record<string, unknown>[] = [o]
  const entry = o.entry
  if (Array.isArray(entry) && entry[0] && typeof entry[0] === 'object') {
    const e0 = entry[0] as Record<string, unknown>
    recordLayers.push(e0)
    const c = e0.content
    if (c && typeof c === 'object') recordLayers.push(c as Record<string, unknown>)
  }
  const topContent = o.content
  if (topContent && typeof topContent === 'object') {
    recordLayers.push(topContent as Record<string, unknown>)
  }
  const items = o.items
  if (Array.isArray(items) && items[0] && typeof items[0] === 'object') {
    recordLayers.push(items[0] as Record<string, unknown>)
    const it0 = items[0] as Record<string, unknown>
    const ic = it0.content
    if (ic && typeof ic === 'object') recordLayers.push(ic as Record<string, unknown>)
  }

  for (const rec of recordLayers) {
    if (rec.isFailed === true || rec.failed === true) return 'failed'

    if (
      truthyCompleteFlag(rec.isDone) ||
      truthyCompleteFlag(rec.done) ||
      truthyCompleteFlag(rec.completed) ||
      truthyCompleteFlag(rec.isComplete) ||
      truthyCompleteFlag(rec.finished)
    ) {
      return 'completed'
    }

    const dispatch = String(rec.dispatchState ?? rec.dispatch_state ?? '').toUpperCase()
    const status = String(rec.status ?? rec.state ?? rec.phase ?? '').toLowerCase()
    const progressRaw = rec.progress

    if (dispatch === 'FAILED' || status === 'failed' || status === 'error' || status === 'cancelled') {
      return 'failed'
    }

    if (
      dispatch === 'COMPLETED' ||
      dispatch === 'DONE' ||
      status === 'completed' ||
      status === 'done' ||
      status === 'success' ||
      status === 'complete' ||
      String(progressRaw ?? '') === 'complete'
    ) {
      return 'completed'
    }

    if (typeof progressRaw === 'number' && progressRaw >= 100) return 'completed'
  }

  return 'running'
}

const TOTAL_HINT_KEYS = [
  'total',
  'totalCount',
  'total_count',
  'totalEventCount',
  'persistedEventCount',
  'resultCount',
  'result_count',
  'numResults',
  'num_results',
  'eventCount',
  'event_count',
  'events',
  'matchingEvents',
  'matching_events',
  'scanned',
  'scanCount',
  'scan_count',
  'records',
  'rowCount',
  'row_count',
]

function pickFiniteCount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.trunc(v)
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10)
  return null
}

/**
 * Best-effort parse of total hit / event counts from job status or results JSON.
 */
export function parseTotalRecordHint(data: unknown): number | null {
  if (data == null) return null
  if (typeof data !== 'object') return null

  const visit = (o: Record<string, unknown>): number | null => {
    for (const k of TOTAL_HINT_KEYS) {
      const n = pickFiniteCount(o[k])
      if (n !== null) return n
    }
    return null
  }

  const o = data as Record<string, unknown>
  const direct = visit(o)
  if (direct !== null) return direct

  const entry = o.entry
  if (Array.isArray(entry) && entry[0] && typeof entry[0] === 'object') {
    const e0 = entry[0] as Record<string, unknown>
    const fromE = visit(e0)
    if (fromE !== null) return fromE
    const content = e0.content
    if (content && typeof content === 'object') {
      const c = visit(content as Record<string, unknown>)
      if (c !== null) return c
    }
  }

  const content = o.content
  if (content && typeof content === 'object') {
    const c = visit(content as Record<string, unknown>)
    if (c !== null) return c
  }

  return null
}

function isNdjsonContentType(ct: string | null): boolean {
  if (!ct) return false
  const lower = ct.toLowerCase()
  return lower.includes('ndjson') || lower.includes('newline-delimited')
}

/** NDJSON results: first line is often job metadata (`isFinished`, `totalEventCount`); following lines are events. */
function isSearchResultsMetaLine(o: Record<string, unknown>): boolean {
  if (o.isFinished === true) return true
  if (o.job !== undefined && typeof o.job === 'object') return true
  if (o.totalEventCount !== undefined && o.dataset === undefined && o._raw === undefined) return true
  return false
}

/**
 * Parse Cribl Search `/results` bodies when returned as newline-delimited JSON (common in production).
 */
export function parseNdjsonSearchResultsBody(text: string): {
  rows: Record<string, unknown>[]
  totalHint: number | null
} {
  const rows: Record<string, unknown>[] = []
  let totalHint: number | null = null
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    let obj: unknown
    try {
      obj = JSON.parse(t)
    } catch {
      continue
    }
    if (!obj || typeof obj !== 'object') continue
    const o = obj as Record<string, unknown>
    if (isSearchResultsMetaLine(o)) {
      const h = parseTotalRecordHint(o)
      if (h !== null) totalHint = h
      continue
    }
    rows.push(o)
  }
  return { rows, totalHint }
}

async function parseSearchJobResultsResponse(res: Response): Promise<{
  rows: Record<string, unknown>[]
  totalHint: number | null
}> {
  const text = await res.text()
  const ct = res.headers.get('content-type')

  if (isNdjsonContentType(ct)) {
    return parseNdjsonSearchResultsBody(text)
  }

  const trimmed = text.replace(/^\uFEFF/, '').trim()
  if (trimmed.includes('\n')) {
    const firstLine = trimmed.slice(0, trimmed.indexOf('\n')).trim()
    if (firstLine.startsWith('{')) {
      try {
        const firstObj = JSON.parse(firstLine) as Record<string, unknown>
        if (isSearchResultsMetaLine(firstObj)) {
          return parseNdjsonSearchResultsBody(trimmed)
        }
      } catch {
        /* fall through to single JSON */
      }
    }
  }

  const data = parseLenientJsonResponseBody(text)
  return {
    rows: extractResultRows(data),
    totalHint: parseTotalRecordHint(data),
  }
}

function extractResultRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    return data.filter((x) => x && typeof x === 'object') as Record<string, unknown>[]
  }
  if (!data || typeof data !== 'object') return []
  const o = data as Record<string, unknown>
  const candidates = [o.results, o.events, o.rows, o.data, o.items]
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c
        .map((row) => {
          if (row && typeof row === 'object') return row as Record<string, unknown>
          if (typeof row === 'string') {
            try {
              return JSON.parse(row) as Record<string, unknown>
            } catch {
              return { _raw: row }
            }
          }
          return { _value: row }
        })
        .filter(Boolean)
    }
  }
  return []
}

export type RunSearchJobOptions = {
  query: string
  /** `verbatim` sends query exactly as provided; `normalized` applies legacy `cribl` prefix behavior. */
  queryMode?: 'normalized' | 'verbatim'
  /**
   * Max rows to load into the DataFrame. `0` (default) loads every row the job returns,
   * paginating `/results` until no more rows. Values greater than `0` cap the loaded set.
   */
  maxRows?: number
  onProgress?: (ev: SearchProgressEvent) => void
  /** Search job time window; defaults applied below when unset. */
  earliest?: string
  latest?: string
}

function emitProgress(
  onProgress: RunSearchJobOptions['onProgress'],
  fraction: number,
  label: string,
): void {
  onProgress?.({ fraction: Math.min(1, Math.max(0, fraction)), label })
}

/**
 * Runs a search job and returns result rows as plain objects (DataFrame-ready).
 * When `maxRows` is `0`, fetches every page of `/results` until exhausted.
 * In dev (no CRIBL_API_URL), returns mock rows without calling the network.
 */
export async function runCriblSearchJob(options: RunSearchJobOptions): Promise<CriblSearchJobResult> {
  const base = getCriblApiBase()
  const queryMode = options.queryMode ?? 'normalized'
  const q = queryMode === 'verbatim' ? options.query.trim() : normalizeSearchQuery(options.query)
  const maxRows = options.maxRows ?? 0

  if (!base) {
    return runLocalSearchStub({ ...options, maxRows })
  }

  const root = searchBasePath(base)
  emitProgress(options.onProgress, 0.08, 'Submitting search job…')

  const createRes = await fetch(`${root}/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: q,
      earliest: options.earliest ?? DEFAULT_SEARCH_EARLIEST,
      latest: options.latest ?? DEFAULT_SEARCH_LATEST,
      sampleRate: 1,
    }),
  })

  if (!createRes.ok) {
    const t = await createRes.text().catch(() => '')
    throw new Error(`Search job create failed (${createRes.status}): ${t || createRes.statusText}`)
  }

  const created: unknown = await readSearchResponseJson(createRes)
  const jobId = parseSearchJobCreateId(created)
  if (!jobId) {
    const preview =
      typeof created === 'object' && created !== null
        ? JSON.stringify(created).slice(0, 500)
        : String(created)
    throw new Error(`Search job create response missing job id. Body preview: ${preview}`)
  }

  emitProgress(options.onProgress, 0.18, `Job ${jobId}: queued…`)

  let lastStatusJson: unknown = created
  const initialPhase = parseJobPhase(created)

  if (initialPhase === 'failed') {
    throw new Error('Search job failed.')
  }

  if (initialPhase === 'completed') {
    emitProgress(options.onProgress, 0.88, `Job ${jobId}: fetching results…`)
  } else {
    for (let i = 0; i < MAX_POLLS; i++) {
      const statusRes = await fetch(`${root}/jobs/${encodeURIComponent(jobId)}/status`)
      if (!statusRes.ok) {
        const t = await statusRes.text().catch(() => '')
        throw new Error(`Search job status failed (${statusRes.status}): ${t || statusRes.statusText}`)
      }
      const statusJson: unknown = await readSearchResponseJson(statusRes)
      lastStatusJson = statusJson
      const phase = parseJobPhase(statusJson)
      if (phase === 'failed') {
        throw new Error('Search job failed.')
      }
      if (phase === 'completed') {
        emitProgress(options.onProgress, 0.88, `Job ${jobId}: fetching results…`)
        break
      }
      const pollFrac = 0.22 + (0.62 * (i + 1)) / MAX_POLLS
      emitProgress(options.onProgress, Math.min(0.85, pollFrac), `Job ${jobId}: running…`)
      await sleep(POLL_MS)
    }
  }

  const totalFromStatus = lastStatusJson != null ? parseTotalRecordHint(lastStatusJson) : null

  const cap = maxRows === 0 ? Number.MAX_SAFE_INTEGER : maxRows
  const rows: Record<string, unknown>[] = []
  let offset = 0
  let pageIndex = 0
  let totalFromResults: number | null = null

  const emitRowsProgress = (): void => {
    const loaded = rows.length
    const target =
      totalFromStatus != null && totalFromStatus > 0
        ? Math.min(cap, totalFromStatus)
        : cap < Number.MAX_SAFE_INTEGER
          ? cap
          : null
    let frac: number
    if (target != null && target > 0) {
      frac = 0.88 + 0.09 * Math.min(1, loaded / target)
    } else {
      frac = 0.88 + 0.09 * Math.min(1, 1 - Math.exp(-pageIndex / 5))
    }
    emitProgress(
      options.onProgress,
      frac,
      `Job ${jobId}: retrieved ${loaded} row(s)${maxRows === 0 ? '' : ` (limit ${maxRows})`}…`,
    )
  }

  while (rows.length < cap) {
    const remaining = cap - rows.length
    const pageLimit = Math.min(CRIBL_SEARCH_RESULTS_PAGE_SIZE, remaining)
    const resultsRes = await fetch(
      `${root}/jobs/${encodeURIComponent(jobId)}/results?offset=${offset}&limit=${pageLimit}`,
    )
    if (!resultsRes.ok) {
      const t = await resultsRes.text().catch(() => '')
      throw new Error(`Search results failed (${resultsRes.status}): ${t || resultsRes.statusText}`)
    }
    const { rows: batch, totalHint: pageHint } = await parseSearchJobResultsResponse(resultsRes)
    if (pageHint !== null) totalFromResults = pageHint

    if (batch.length === 0) break

    rows.push(...batch)
    offset += batch.length
    pageIndex += 1
    emitRowsProgress()

    if (batch.length < pageLimit) break
    if (rows.length >= cap) break
  }

  const totalRecords = totalFromResults ?? totalFromStatus ?? null
  const columns = deriveColumnNames(rows)

  emitProgress(
    options.onProgress,
    0.98,
    `Retrieved ${rows.length} row(s)${maxRows === 0 ? '' : ` (capped at ${maxRows})`}.`,
  )

  return { rows, columns, totalRecords }
}
