/**
 * Cribl Search jobs via REST (see AGENTS.md / CLAUDE.md — use group default_search).
 * Uses window fetch to CRIBL_API_URL so the platform proxy injects auth.
 */

import { getCriblApiBase } from './kvstore'

const SEARCH_GROUP = 'default_search'
const POLL_MS = 450
const MAX_POLLS = 200

function searchBasePath(apiBase: string): string {
  return `${apiBase}/m/${SEARCH_GROUP}/search`
}

/** Prepends the `cribl` operator when missing (Search API expects it). */
export function normalizeSearchQuery(query: string): string {
  const q = query.trim()
  if (!q) return q
  if (/^cribl\b/i.test(q)) return q
  return `cribl ${q}`
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function pickJobId(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const id = o.id ?? o.sid ?? o.jobId ?? o.job_id
  return typeof id === 'string' && id.length > 0 ? id : null
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

const MOCK_ROWS: Record<string, unknown>[] = [
  { _time: '2025-01-01T00:00:00.000Z', host: 'mock-a', _raw: 'sample event 1' },
  { _time: '2025-01-01T00:01:00.000Z', host: 'mock-b', _raw: 'sample event 2' },
]

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
    options.onProgress?.('Cribl Search (offline mock): preparing…')
    await sleep(80)
    options.onProgress?.('Cribl Search (offline mock): running…')
    await sleep(120)
    options.onProgress?.('Cribl Search (offline mock): done.')
    return MOCK_ROWS.map((r) => ({ ...r }))
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
  const jobId = pickJobId(created)
  if (!jobId) {
    throw new Error('Search job create response missing job id.')
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
