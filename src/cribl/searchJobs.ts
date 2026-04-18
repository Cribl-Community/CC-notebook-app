/**
 * Cribl Search jobs via REST (see AGENTS.md / CLAUDE.md — use group default_search).
 * Uses window fetch to CRIBL_API_URL so the platform proxy injects auth.
 */

import { getCriblApiBase } from './kvstore'
import { normalizeSearchQuery } from './searchQuery'
import { deriveColumnNames } from './searchResultModel'
import { runLocalSearchStub } from './searchStub'

export { normalizeSearchQuery } from './searchQuery'

const SEARCH_GROUP = 'default_search'
const POLL_MS = 450
const MAX_POLLS = 200

/** Default max rows fetched from the API and shown in the notebook UI. */
export const DEFAULT_CRIBL_SEARCH_MAX_ROWS = 20

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

function parseJobPhase(data: unknown): 'running' | 'completed' | 'failed' {
  if (!data || typeof data !== 'object') return 'running'
  const o = data as Record<string, unknown>
  const entry0 = Array.isArray(o.entry) ? o.entry[0] : undefined
  const inner = entry0 ?? o.content ?? o
  const rec = typeof inner === 'object' && inner !== null ? (inner as Record<string, unknown>) : o
  const dispatch = String(rec.dispatchState ?? rec.dispatch_state ?? '').toUpperCase()
  const status = String(rec.status ?? '').toLowerCase()
  const progress = String(rec.progress ?? '')

  if (dispatch === 'FAILED' || status === 'failed' || progress === 'error') return 'failed'
  if (
    dispatch === 'COMPLETED' ||
    dispatch === 'DONE' ||
    status === 'completed' ||
    progress === 'complete'
  ) {
    return 'completed'
  }
  return 'running'
}

const TOTAL_HINT_KEYS = [
  'total',
  'totalCount',
  'total_count',
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
  /** Max rows to request from the results endpoint (default {@link DEFAULT_CRIBL_SEARCH_MAX_ROWS}). */
  maxRows?: number
  onProgress?: (ev: SearchProgressEvent) => void
}

function emitProgress(
  onProgress: RunSearchJobOptions['onProgress'],
  fraction: number,
  label: string,
): void {
  onProgress?.({ fraction: Math.min(1, Math.max(0, fraction)), label })
}

/**
 * Runs a search job and returns up to `maxRows` result rows as plain objects (DataFrame-ready).
 * In dev (no CRIBL_API_URL), returns mock rows without calling the network.
 */
export async function runCriblSearchJob(options: RunSearchJobOptions): Promise<CriblSearchJobResult> {
  const base = getCriblApiBase()
  const q = normalizeSearchQuery(options.query)
  const maxRows = options.maxRows ?? DEFAULT_CRIBL_SEARCH_MAX_ROWS

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
      earliest: '-24h',
      latest: 'now',
      sampleRate: 1,
    }),
  })

  if (!createRes.ok) {
    const t = await createRes.text().catch(() => '')
    throw new Error(`Search job create failed (${createRes.status}): ${t || createRes.statusText}`)
  }

  const created: unknown = await createRes.json()
  const jobId = parseSearchJobCreateId(created)
  if (!jobId) {
    const preview =
      typeof created === 'object' && created !== null
        ? JSON.stringify(created).slice(0, 500)
        : String(created)
    throw new Error(`Search job create response missing job id. Body preview: ${preview}`)
  }

  emitProgress(options.onProgress, 0.18, `Job ${jobId}: queued…`)

  let lastStatusJson: unknown
  for (let i = 0; i < MAX_POLLS; i++) {
    const statusRes = await fetch(`${root}/jobs/${encodeURIComponent(jobId)}/status`)
    if (!statusRes.ok) {
      const t = await statusRes.text().catch(() => '')
      throw new Error(`Search job status failed (${statusRes.status}): ${t || statusRes.statusText}`)
    }
    const statusJson: unknown = await statusRes.json()
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

  const totalFromStatus = lastStatusJson != null ? parseTotalRecordHint(lastStatusJson) : null

  const resultsRes = await fetch(
    `${root}/jobs/${encodeURIComponent(jobId)}/results?offset=0&limit=${maxRows}`,
  )
  if (!resultsRes.ok) {
    const t = await resultsRes.text().catch(() => '')
    throw new Error(`Search results failed (${resultsRes.status}): ${t || resultsRes.statusText}`)
  }
  const resultsJson: unknown = await resultsRes.json()
  const rows = extractResultRows(resultsJson)
  const totalFromResults = parseTotalRecordHint(resultsJson)
  const totalRecords = totalFromResults ?? totalFromStatus ?? null

  const columns = deriveColumnNames(rows)

  emitProgress(options.onProgress, 0.98, `Retrieved ${rows.length} row(s).`)

  return { rows, columns, totalRecords }
}
