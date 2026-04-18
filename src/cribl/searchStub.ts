/**
 * In-process Cribl Search stub when `CRIBL_API_URL` is unset (local Vite / tests).
 * Does not hit the network — same behavior the app used before, but isolated and configurable.
 *
 * Optional overrides (browser devtools / tests):
 * - `window.__NB_LOCAL_SEARCH_STUB__.rows` — replace result rows
 * - `window.__NB_LOCAL_SEARCH_STUB__.failMessage` — if set, throw after progress
 * - `window.__NB_LOCAL_SEARCH_STUB__.delayMs` — per-phase delay (default ~80–120ms)
 */

import { normalizeSearchQuery } from './searchQuery'
import type { CriblSearchJobResult, RunSearchJobOptions } from './searchJobs'
import { DEFAULT_CRIBL_SEARCH_MAX_ROWS } from './searchJobs'
import { deriveColumnNames } from './searchResultModel'

export type LocalSearchStubWindowHook = {
  rows?: Record<string, unknown>[]
  /** If non-empty, stub throws this message (for error-path testing). */
  failMessage?: string
  delayMs?: number
}

declare global {
  interface Window {
    __NB_LOCAL_SEARCH_STUB__?: LocalSearchStubWindowHook
  }
}

const DEFAULT_ROWS: Record<string, unknown>[] = [
  { _time: '2025-01-01T00:00:00.000Z', host: 'stub-host-1', _raw: 'sample event 1' },
  { _time: '2025-01-01T00:01:00.000Z', host: 'stub-host-2', _raw: 'sample event 2' },
  { _time: '2025-01-01T00:02:00.000Z', host: 'stub-host-3', _raw: 'sample event 3' },
]

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

function getHook(): LocalSearchStubWindowHook | undefined {
  if (typeof window === 'undefined') return undefined
  return window.__NB_LOCAL_SEARCH_STUB__
}

/** Builds rows that echo the normalized query so you can see the stub received your KQL. */
export function buildStubRowsForQuery(userQuery: string): Record<string, unknown>[] {
  const q = normalizeSearchQuery(userQuery.trim())
  return DEFAULT_ROWS.map((row, i) => ({
    ...row,
    _stub_index: i,
    query: q,
  }))
}

/**
 * Simulates submit → run → complete progress lines and returns DataFrame-ready objects.
 */
export async function runLocalSearchStub(options: RunSearchJobOptions): Promise<CriblSearchJobResult> {
  const hook = getHook()
  const fail = hook?.failMessage?.trim()
  const delayPrepare = hook?.delayMs ?? 80
  const delayRun = hook?.delayMs ?? 120

  const q = normalizeSearchQuery(options.query)
  const cap = options.maxRows ?? DEFAULT_CRIBL_SEARCH_MAX_ROWS
  options.onProgress?.({ fraction: 0.1, label: '[local stub] preparing search…' })
  await sleep(delayPrepare)

  if (fail) {
    options.onProgress?.({ fraction: 0.95, label: '[local stub] failed.' })
    throw new Error(fail)
  }

  options.onProgress?.({
    fraction: 0.45,
    label: `[local stub] running: ${q.slice(0, 120)}${q.length > 120 ? '…' : ''}`,
  })
  await sleep(delayRun)

  const rawRows =
    hook?.rows && hook.rows.length > 0 ? hook.rows.map((r) => ({ ...r })) : buildStubRowsForQuery(options.query)
  const rows = rawRows.slice(0, cap)
  const columns = deriveColumnNames(rows)

  options.onProgress?.({ fraction: 0.97, label: `[local stub] done (${rows.length} row(s)).` })

  return { rows, columns, totalRecords: rows.length }
}
