/**
 * Cribl Search / system lookup files under `/m/{group}/system/lookups`.
 * See Cribl API docs: Create and Update Lookups.
 */

import { callCriblApi } from '@platform/cribl/criblApiFetch'
import { parseLenientJsonResponseBody } from '@platform/cribl/searchJobs'
import type { LookupService, SaveSearchLookupOptions } from '@ports/LookupService'

/** Same group as Search jobs in {@link searchJobs.ts}. */
export const DEFAULT_SEARCH_LOOKUP_GROUP = 'default_search'

function lookupsBasePath(group: string): string {
  const g = group.trim()
  if (!g) throw new Error('Lookup group must be non-empty.')
  return `/m/${g}/system/lookups`
}

function httpError(method: string, path: string, status: number, text: string): Error {
  const hint = text.replace(/\s+/g, ' ').trim().slice(0, 400)
  return new Error(`${method} ${path} failed (${status})${hint ? `: ${hint}` : ''}`)
}

type LookupListResponse = {
  items?: { id?: string }[]
}

export async function listLookupIds(group: string): Promise<string[]> {
  const path = lookupsBasePath(group)
  const res = await callCriblApi('GET', path, {
    headers: { Accept: 'application/json' },
    body: undefined,
    bodyIsJson: false,
  })
  if (!res.ok) throw httpError('GET', path, res.status, res.text)
  const parsed = parseLenientJsonResponseBody(res.text) as LookupListResponse
  const items = parsed.items ?? []
  return items.map((x) => x.id).filter((id): id is string => typeof id === 'string' && id.length > 0)
}

/**
 * Upload CSV bytes as a temporary file; returns the temp `filename` from the JSON body.
 */
export async function uploadLookupCsvTemp(group: string, uploadFilename: string, csvUtf8: string): Promise<string> {
  const path = `${lookupsBasePath(group)}?filename=${encodeURIComponent(uploadFilename)}`
  const res = await callCriblApi('PUT', path, {
    headers: { 'Content-Type': 'text/csv' },
    body: csvUtf8,
    bodyIsJson: false,
  })
  if (!res.ok) throw httpError('PUT', path, res.status, res.text)
  const parsed = parseLenientJsonResponseBody(res.text) as { filename?: string }
  const fn = parsed.filename
  if (typeof fn !== 'string' || !fn.length) {
    throw new Error('Lookup upload response missing filename.')
  }
  return fn
}

function registerBody(id: string, tempFilename: string, mode: SaveSearchLookupOptions['mode']): string {
  const o: Record<string, unknown> = {
    id,
    fileInfo: { filename: tempFilename },
  }
  if (mode === 'disk') o.mode = 'disk'
  return JSON.stringify(o)
}

export async function postLookupFromUpload(
  group: string,
  id: string,
  tempFilename: string,
  mode: SaveSearchLookupOptions['mode'],
): Promise<void> {
  const path = lookupsBasePath(group)
  const res = await callCriblApi('POST', path, {
    headers: {},
    body: registerBody(id, tempFilename, mode),
    bodyIsJson: true,
  })
  if (!res.ok) throw httpError('POST', path, res.status, res.text)
}

export async function patchLookupFromUpload(
  group: string,
  id: string,
  tempFilename: string,
  mode: SaveSearchLookupOptions['mode'],
): Promise<void> {
  const path = `${lookupsBasePath(group)}/${encodeURIComponent(id)}`
  const res = await callCriblApi('PATCH', path, {
    headers: {},
    body: registerBody(id, tempFilename, mode),
    bodyIsJson: true,
  })
  if (!res.ok) throw httpError('PATCH', path, res.status, res.text)
}

export async function downloadLookupCsvRaw(group: string, lookupId: string): Promise<string> {
  const path = `${lookupsBasePath(group)}/${encodeURIComponent(lookupId)}/content?raw=1`
  const res = await callCriblApi('GET', path, {
    headers: { Accept: 'text/csv,*/*' },
    body: undefined,
    bodyIsJson: false,
  })
  if (!res.ok) throw httpError('GET', path, res.status, res.text)
  return res.text
}

/** Normalize lookup id to include `.csv` when the user omits it. */
export function normalizeSearchLookupCsvId(lookupId: string): string {
  const t = lookupId.trim()
  if (!t.length) throw new Error('Lookup id is empty.')
  return t.toLowerCase().endsWith('.csv') ? t : `${t}.csv`
}

async function saveLookupFromCsvImpl(opts: SaveSearchLookupOptions): Promise<void> {
  const id = normalizeSearchLookupCsvId(opts.lookupId)
  const uploadName = `notebook_upload_${Date.now()}.csv`
  const temp = await uploadLookupCsvTemp(opts.group, uploadName, opts.csvUtf8)
  const ids = await listLookupIds(opts.group)
  const exists = ids.includes(id)
  if (exists && !opts.replace) {
    throw new Error(
      `Lookup ${JSON.stringify(id)} already exists. Re-run with replace=true to overwrite, or pick a new name.`,
    )
  }
  if (exists) {
    await patchLookupFromUpload(opts.group, id, temp, opts.mode)
  } else {
    await postLookupFromUpload(opts.group, id, temp, opts.mode)
  }
}

export const criblLookupService: LookupService = {
  saveLookupFromCsv: saveLookupFromCsvImpl,
  async downloadLookupCsv(opts) {
    return downloadLookupCsvRaw(opts.group, normalizeSearchLookupCsvId(opts.lookupId))
  },
}
