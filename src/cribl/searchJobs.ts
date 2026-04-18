/**
 * Cribl Search jobs via REST (see AGENTS.md / CLAUDE.md — use group default_search).
 * Uses window fetch to CRIBL_API_URL so the platform proxy injects auth.
 */

import { getCriblApiBase } from './kvstore'
import { normalizeSearchQuery } from './searchQuery'
import { runLocalSearchStub } from './searchStub'

export { normalizeSearchQuery } from './searchQuery'

const SEARCH_GROUP = 'default_search'
const POLL_MS = 450
const MAX_POLLS = 200

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
  onProgress?: (line: string) => void
}

/**
 * Runs a search job and returns result rows as plain objects (DataFrame-ready).
 * In dev (no CRIBL_API_URL), returns mock rows without calling the network.
 */
export async function runCriblSearchJob(options: RunSearchJobOptions): Promise<Record<string, unknown>[]> {
  const base = getCriblApiBase()
  const q = normalizeSearchQuery(options.query)

  if (!base) {
    return runLocalSearchStub(options)
  }

  const root = searchBasePath(base)
  options.onProgress?.('Submitting search job…')

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

  options.onProgress?.(`Job ${jobId}: queued…`)

  for (let i = 0; i < MAX_POLLS; i++) {
    const statusRes = await fetch(`${root}/jobs/${encodeURIComponent(jobId)}/status`)
    if (!statusRes.ok) {
      const t = await statusRes.text().catch(() => '')
      throw new Error(`Search job status failed (${statusRes.status}): ${t || statusRes.statusText}`)
    }
    const statusJson: unknown = await statusRes.json()
    const phase = parseJobPhase(statusJson)
    if (phase === 'failed') {
      throw new Error('Search job failed.')
    }
    if (phase === 'completed') {
      options.onProgress?.(`Job ${jobId}: fetching results…`)
      break
    }
    options.onProgress?.(`Job ${jobId}: running…`)
    await sleep(POLL_MS)
  }

  const limit = 1000
  let offset = 0
  const all: Record<string, unknown>[] = []

  for (;;) {
    const resultsRes = await fetch(
      `${root}/jobs/${encodeURIComponent(jobId)}/results?offset=${offset}&limit=${limit}`,
    )
    if (!resultsRes.ok) {
      const t = await resultsRes.text().catch(() => '')
      throw new Error(`Search results failed (${resultsRes.status}): ${t || resultsRes.statusText}`)
    }
    const resultsJson: unknown = await resultsRes.json()
    const batch = extractResultRows(resultsJson)
    if (batch.length === 0) break
    all.push(...batch)
    if (batch.length < limit) break
    offset += limit
  }

  options.onProgress?.(`Retrieved ${all.length} row(s).`)
  return all
}
