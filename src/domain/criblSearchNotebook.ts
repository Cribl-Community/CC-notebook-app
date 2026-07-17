/**
 * Types and normalizers for Cribl Search Notebooks REST payloads.
 * API shape is inferred from product docs and list/get `/search/notebooks` responses;
 * normalizers accept field-name variants defensively.
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

function readCellType(obj: Record<string, unknown>): 'search' | 'note' | null {
  const raw = readString(obj, 'type', 'cellType', 'cell_type', 'kind')
  if (!raw) {
    if (readString(obj, 'query', 'search', 'kql')) return 'search'
    if (readString(obj, 'content', 'text', 'markdown', 'body', 'note')) return 'note'
    return null
  }
  const t = raw.toLowerCase()
  if (t === 'search' || t === 'query') return 'search'
  if (t === 'note' || t === 'markdown' || t === 'text') return 'note'
  return null
}

export function normalizeCriblSearchNotebookMeta(raw: unknown): CriblSearchNotebookMeta | null {
  const obj = asRecord(raw)
  if (!obj) return null
  const id = readString(obj, 'id')
  const name = readString(obj, 'name', 'title', 'displayName')
  if (!id || !name) return null
  const updatedAt = typeof obj.updatedAt === 'number' ? obj.updatedAt : undefined
  return { id, name, updatedAt }
}

export function normalizeCriblSearchNotebookCell(raw: unknown): CriblSearchNotebookCell | null {
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

export function normalizeCriblSearchNotebookData(raw: unknown): CriblSearchNotebookData {
  const obj = asRecord(raw)
  if (!obj) throw new Error('Invalid Cribl Search notebook response.')
  const id = readString(obj, 'id')
  const name = readString(obj, 'name', 'title', 'displayName')
  if (!id || !name) throw new Error('Cribl Search notebook response missing id or name.')

  const rawCells = Array.isArray(obj.cells)
    ? obj.cells
    : Array.isArray(obj.items)
      ? obj.items
      : []
  const cells: CriblSearchNotebookCell[] = []
  for (const c of rawCells) {
    const normalized = normalizeCriblSearchNotebookCell(c)
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
