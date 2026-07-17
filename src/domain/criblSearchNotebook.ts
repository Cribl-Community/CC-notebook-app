/**
 * Types and normalizers for Cribl Search Notebooks REST payloads.
 * Shapes align with Cribl Search API (`GET /search/notebooks`, `GET /search/notebooks/{id}`):
 * list items use `{ id, info: { name, created, modified }, sections? }`; detail GET may wrap
 * `{ items: [notebook] }`.
 */

/** One notebook in the list response (`GET /search/notebooks`). */
export type CriblSearchNotebookMeta = {
  id: string
  name: string
  updatedAt?: number
}

/** Parsed search cell from a Cribl Search Notebook. */
export type CriblSearchNotebookSearchCell = {
  kind: 'search'
  title?: string
  query: string
  earliest?: string
  latest?: string
}

/** Parsed note (markdown) cell from a Cribl Search Notebook. */
export type CriblSearchNotebookNoteCell = {
  kind: 'note'
  content: string
}

export type CriblSearchNotebookCell = CriblSearchNotebookSearchCell | CriblSearchNotebookNoteCell

/** Normalized notebook document from `GET /search/notebooks/{id}`. */
export type CriblSearchNotebookData = {
  id: string
  name: string
  cells: CriblSearchNotebookCell[]
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function readString(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return undefined
}

function readNotebookName(obj: Record<string, unknown>): string | undefined {
  const direct = readString(obj, 'name', 'title', 'displayName')
  if (direct) return direct
  const info = asRecord(obj.info)
  return info ? readString(info, 'name', 'title', 'displayName') : undefined
}

function readNotebookUpdatedAt(obj: Record<string, unknown>): number | undefined {
  if (typeof obj.updatedAt === 'number') return obj.updatedAt
  const info = asRecord(obj.info)
  if (!info) return undefined
  if (typeof info.modified === 'number') return info.modified
  if (typeof info.updatedAt === 'number') return info.updatedAt
  if (typeof info.created === 'number') return info.created
  return undefined
}

/** Unwrap `{ items: [notebook] }` detail responses from GET /search/notebooks/{id}. */
export function unwrapCriblSearchNotebookPayload(raw: unknown): Record<string, unknown> {
  const obj = asRecord(raw)
  if (!obj) throw new Error('Invalid Cribl Search notebook response.')
  if (Array.isArray(obj.items) && obj.items.length > 0) {
    const first = asRecord(obj.items[0])
    if (first && readString(first, 'id') && (asRecord(first.info) || Array.isArray(first.sections))) {
      return first
    }
  }
  return obj
}

function readCellType(obj: Record<string, unknown>): 'search' | 'note' | null {
  const raw = readString(obj, 'type', 'cellType', 'cell_type', 'kind', 'variant')
  if (!raw) {
    if (readString(obj, 'query', 'search', 'kql')) return 'search'
    if (readString(obj, 'content', 'text', 'markdown', 'body', 'note')) return 'note'
    return null
  }
  const t = raw.toLowerCase()
  if (t === 'search' || t === 'query' || t.includes('search')) return 'search'
  if (t === 'note' || t === 'markdown' || t === 'text' || t.includes('markdown')) return 'note'
  return null
}

function normalizeLegacyCell(raw: unknown): CriblSearchNotebookCell | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const kind = readCellType(obj)
  if (kind === 'search') {
    const query = readString(obj, 'query', 'search', 'kql', 'body')
    if (!query) return null
    return {
      kind: 'search',
      title: readString(obj, 'title', 'name', 'label'),
      query,
      earliest: readString(obj, 'earliest', 'timeEarliest', 'time_earliest'),
      latest: readString(obj, 'latest', 'timeLatest', 'time_latest'),
    }
  }
  if (kind === 'note') {
    const content = readString(obj, 'content', 'text', 'markdown', 'body', 'note')
    if (!content) return null
    return { kind: 'note', content }
  }
  return null
}

/** Normalize a Cribl Search Notebook `sections[]` entry (or legacy cell shape). */
export function normalizeCriblSearchNotebookSection(raw: unknown): CriblSearchNotebookCell | null {
  const obj = asRecord(raw)
  if (!obj) return null

  const config = asRecord(obj.config)
  const info = asRecord(obj.info)
  const variant = readString(obj, 'variant')?.toLowerCase()
  const type = readString(obj, 'type')?.toLowerCase()
  const title = info ? readString(info, 'title', 'name', 'label') : undefined

  const isMarkdown =
    variant === 'markdown' ||
    type?.includes('markdown') ||
    (config != null && readString(config, 'markdown') != null && !readString(config, 'query'))
  if (isMarkdown) {
    const content =
      (config ? readString(config, 'markdown', 'text', 'content') : undefined) ??
      readString(obj, 'markdown', 'content', 'text')
    if (!content) return null
    return { kind: 'note', content }
  }

  const isSearch =
    variant === 'search' ||
    type?.includes('search') ||
    (config != null && readString(config, 'query', 'search', 'kql') != null)
  if (isSearch) {
    const query =
      (config ? readString(config, 'query', 'search', 'kql') : undefined) ??
      readString(obj, 'query', 'search', 'kql')
    if (!query) return null
    return {
      kind: 'search',
      title,
      query,
      earliest: config ? readString(config, 'earliest', 'timeEarliest', 'time_earliest') : undefined,
      latest: config ? readString(config, 'latest', 'timeLatest', 'time_latest') : undefined,
    }
  }

  return normalizeLegacyCell(raw)
}

export function normalizeCriblSearchNotebookMeta(raw: unknown): CriblSearchNotebookMeta | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const id = readString(obj, 'id')
  const name = readNotebookName(obj)
  if (!id || !name) return null
  const updatedAt = readNotebookUpdatedAt(obj)
  return updatedAt != null ? { id, name, updatedAt } : { id, name }
}

/** @deprecated Use normalizeCriblSearchNotebookSection for API sections. */
export function normalizeCriblSearchNotebookCell(raw: unknown): CriblSearchNotebookCell | null {
  return normalizeCriblSearchNotebookSection(raw)
}

export function normalizeCriblSearchNotebookData(raw: unknown): CriblSearchNotebookData {
  const obj = unwrapCriblSearchNotebookPayload(raw)
  const id = readString(obj, 'id')
  const name = readNotebookName(obj)
  if (!id || !name) throw new Error('Cribl Search notebook response missing id or name.')

  const rawSections = Array.isArray(obj.sections)
    ? obj.sections
    : Array.isArray(obj.cells)
      ? obj.cells
      : []
  const cells: CriblSearchNotebookCell[] = []
  for (const section of rawSections) {
    const normalized = normalizeCriblSearchNotebookSection(section)
    if (normalized) cells.push(normalized)
  }
  return { id, name, cells }
}

export function normalizeCriblSearchNotebookList(raw: unknown): CriblSearchNotebookMeta[] {
  const obj = asRecord(raw)
  const items = Array.isArray(obj?.items) ? obj.items : Array.isArray(raw) ? raw : []
  const out: CriblSearchNotebookMeta[] = []
  for (const item of items) {
    const meta = normalizeCriblSearchNotebookMeta(item)
    if (meta) out.push(meta)
  }
  return out
}
