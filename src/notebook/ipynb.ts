import type { Cell, CodeCell, MarkdownCell, NotebookState } from './types'
import { CRIBL_SEARCH_MIME, type CellOutput, type CriblSearchPayload } from '../pyodide/types'

const NBFORMAT = 4
const NBFORMAT_MINOR = 5

function normalizeSource(source: unknown): string {
  if (typeof source === 'string') return source
  if (Array.isArray(source)) return source.join('')
  return ''
}

/** Jupyter nbformat often stores stream text as a string or list of strings. */
function normalizeNbformatText(text: unknown): string {
  if (typeof text === 'string') return text
  if (Array.isArray(text)) return text.filter((x): x is string => typeof x === 'string').join('')
  return ''
}

function parseExecutionCount(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  return null
}

function textPlainFromMimeBundle(data: unknown): string | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const tp = d['text/plain']
  if (typeof tp === 'string') return tp
  if (Array.isArray(tp)) return tp.filter((x): x is string => typeof x === 'string').join('')
  return null
}

function criblPayloadFromDisplayData(data: unknown): CriblSearchPayload | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Record<string, unknown>
  const raw = d[CRIBL_SEARCH_MIME]
  if (typeof raw !== 'string' || raw.length === 0) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return null
    const p = parsed as { kind?: unknown }
    if (p.kind === 'running' || p.kind === 'completed' || p.kind === 'failed') {
      return parsed as CriblSearchPayload
    }
  } catch {
    return null
  }
  return null
}

function criblSearchPlainSummary(payload: CriblSearchPayload): string {
  if (payload.kind === 'running') {
    return `Cribl Search: ${payload.label}`
  }
  if (payload.kind === 'failed') {
    return `Cribl Search failed: ${payload.message}`
  }
  const total =
    payload.totalRecords != null && payload.totalRecords !== payload.recordsReturned
      ? `${payload.recordsReturned} records (${payload.totalRecords} total). Columns: ${payload.columns.join(', ')}`
      : `${payload.recordsReturned} records. Columns: ${payload.columns.join(', ')}`
  const tableNote = payload.showTable === false ? ' Table not shown (preview=false).' : ''
  return `Cribl Search: ${total}${tableNote}`
}

function parseNbformatOutput(raw: unknown): CellOutput | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  const ot = o.output_type
  if (ot === 'stream') {
    const name = o.name
    if (name !== 'stdout' && name !== 'stderr') return null
    return {
      output_type: 'stream',
      name,
      text: normalizeNbformatText(o.text),
    }
  }
  if (ot === 'display_data') {
    const cribl = criblPayloadFromDisplayData(o.data)
    if (cribl) {
      return { output_type: 'cribl_search', payload: cribl }
    }
    const plain = textPlainFromMimeBundle(o.data)
    if (plain === null) return null
    return { output_type: 'execute_result', data: plain }
  }
  if (ot === 'execute_result') {
    const plain = textPlainFromMimeBundle(o.data)
    if (plain === null) return null
    return { output_type: 'execute_result', data: plain }
  }
  if (ot === 'error') {
    const ename = typeof o.ename === 'string' ? o.ename : 'Error'
    const evalue = typeof o.evalue === 'string' ? o.evalue : ''
    const tb = o.traceback
    let traceback: string[]
    if (Array.isArray(tb)) {
      traceback = tb.filter((x): x is string => typeof x === 'string')
    } else if (typeof tb === 'string') {
      traceback = tb.split('\n')
    } else {
      traceback = []
    }
    return { output_type: 'error', ename, evalue, traceback }
  }
  return null
}

function parseCodeCell(cell: Record<string, unknown>): CodeCell {
  const outputs: CellOutput[] = []
  const rawOut = cell.outputs
  if (Array.isArray(rawOut)) {
    for (const item of rawOut) {
      const parsed = parseNbformatOutput(item)
      if (parsed) outputs.push(parsed)
    }
  }

  return {
    id: crypto.randomUUID(),
    cell_type: 'code',
    source: normalizeSource(cell.source),
    outputs,
    execution_count: parseExecutionCount(cell.execution_count),
    execution_state: 'idle',
  }
}

function parseMarkdownCell(cell: Record<string, unknown>): MarkdownCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'markdown',
    source: normalizeSource(cell.source),
    editing: false,
  }
}

function extractTitle(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return 'Untitled'
  const t = (metadata as { title?: unknown }).title
  if (typeof t === 'string') {
    const s = t.trim()
    if (s.length > 0) return s
  }
  return 'Untitled'
}

/** Basename without `.ipynb` for display; returns null if unusable. */
export function filenameStemToDisplayTitle(name: string): string | null {
  const trimmed = name.trim()
  if (!trimmed) return null
  const base = trimmed.replace(/[/\\]/g, '/').split('/').pop() ?? trimmed
  const withoutExt = base.replace(/\.ipynb$/i, '').trim()
  return withoutExt.length > 0 ? withoutExt : null
}

/**
 * Prefer embedded metadata when it is non-generic; otherwise use the upload filename stem.
 */
export function resolveImportedNotebookTitle(metadataTitle: string, filename?: string): string {
  const m = metadataTitle.trim()
  if (m.length > 0 && m !== 'Untitled') return m
  if (filename) {
    const stem = filenameStemToDisplayTitle(filename)
    if (stem) return stem
  }
  return 'Untitled'
}

export type IpynbParseOptions = { filename?: string }

export type IpynbParseResult = { title: string; cells: Cell[] }

/**
 * Parses a Jupyter notebook file (nbformat 4). Unsupported cell types are skipped.
 * Code cell outputs and execution counts are loaded from the file (stream, text/plain
 * results, and errors). Other mime types and output kinds are skipped.
 */
export function parseIpynbJson(text: string, options?: IpynbParseOptions): IpynbParseResult {
  let root: unknown
  try {
    root = JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid JSON')
  }
  if (!root || typeof root !== 'object') throw new Error('Notebook root must be an object')
  const nb = root as Record<string, unknown>
  const nf = nb.nbformat
  if (nf !== 4) throw new Error(`Only nbformat 4 is supported (got ${String(nf)})`)
  const cellsRaw = nb.cells
  if (!Array.isArray(cellsRaw)) throw new Error('Notebook must have a cells array')

  const metadataTitle = extractTitle(nb.metadata)
  const title = resolveImportedNotebookTitle(metadataTitle, options?.filename)

  const cells: Cell[] = []
  for (const raw of cellsRaw) {
    if (!raw || typeof raw !== 'object') continue
    const c = raw as Record<string, unknown>
    const ct = c.cell_type
    if (ct === 'code') {
      cells.push(parseCodeCell(c))
    } else if (ct === 'markdown') {
      cells.push(parseMarkdownCell(c))
    }
  }

  if (cells.length === 0) {
    cells.push({
      id: crypto.randomUUID(),
      cell_type: 'code',
      source: '',
      outputs: [],
      execution_count: null,
      execution_state: 'idle',
    })
  }

  return { title, cells }
}

function streamOutputToNbformat(o: Extract<CellOutput, { output_type: 'stream' }>) {
  return {
    output_type: 'stream' as const,
    name: o.name,
    text: o.text,
  }
}

function executeResultToNbformat(
  o: Extract<CellOutput, { output_type: 'execute_result' }>,
  execution_count: number | null,
) {
  return {
    output_type: 'execute_result' as const,
    execution_count: execution_count ?? null,
    data: { 'text/plain': o.data },
    metadata: {},
  }
}

function errorOutputToNbformat(o: Extract<CellOutput, { output_type: 'error' }>) {
  return {
    output_type: 'error' as const,
    ename: o.ename,
    evalue: o.evalue,
    traceback: o.traceback,
  }
}

function criblSearchToNbformat(o: Extract<CellOutput, { output_type: 'cribl_search' }>) {
  return {
    output_type: 'display_data' as const,
    data: {
      'text/plain': criblSearchPlainSummary(o.payload),
      [CRIBL_SEARCH_MIME]: JSON.stringify(o.payload),
    },
    metadata: {},
  }
}

function outputsToNbformat(outputs: CellOutput[], execution_count: number | null): unknown[] {
  const out: unknown[] = []
  for (const o of outputs) {
    if (o.output_type === 'stream') {
      out.push(streamOutputToNbformat(o))
    } else if (o.output_type === 'execute_result') {
      out.push(executeResultToNbformat(o, execution_count))
    } else if (o.output_type === 'cribl_search') {
      out.push(criblSearchToNbformat(o))
    } else if (o.output_type === 'error') {
      out.push(errorOutputToNbformat(o))
    }
  }
  return out
}

/** Safe filename stem for download (no path segments). */
export function titleToDownloadFilename(title: string): string {
  const base = title.trim() || 'Untitled'
  const cleaned = base.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim()
  const stem = cleaned.length > 0 ? cleaned : 'Untitled'
  return `${stem}.ipynb`
}

export function serializeNotebookToIpynbJson(state: NotebookState): string {
  const cells: unknown[] = []

  for (const cell of state.cells) {
    if (cell.cell_type === 'code') {
      cells.push({
        cell_type: 'code',
        execution_count: cell.execution_count,
        metadata: {},
        outputs: outputsToNbformat(cell.outputs, cell.execution_count),
        source: cell.source,
      })
    } else {
      cells.push({
        cell_type: 'markdown',
        metadata: {},
        source: cell.source,
      })
    }
  }

  const doc = {
    nbformat: NBFORMAT,
    nbformat_minor: NBFORMAT_MINOR,
    metadata: {
      title: state.title,
      kernelspec: {
        display_name: 'Python 3',
        language: 'python',
        name: 'python3',
      },
      language_info: {
        name: 'python',
        version: '3.11',
      },
    },
    cells,
  }

  return `${JSON.stringify(doc, null, 1)}\n`
}
