import type { Cell, CodeCell, MarkdownCell, NotebookState } from './types'
import type { CellOutput } from '../pyodide/types'

const NBFORMAT = 4
const NBFORMAT_MINOR = 5

function normalizeSource(source: unknown): string {
  if (typeof source === 'string') return source
  if (Array.isArray(source)) return source.join('')
  return ''
}

function parseCodeCell(cell: Record<string, unknown>): CodeCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'code',
    source: normalizeSource(cell.source),
    outputs: [],
    execution_count: null,
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

export type IpynbParseResult = { title: string; cells: Cell[] }

/**
 * Parses a Jupyter notebook file (nbformat 4). Unsupported cell types are skipped.
 * Imported code cells have cleared outputs and execution counts (fresh kernel state).
 */
export function parseIpynbJson(text: string): IpynbParseResult {
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

  const title = extractTitle(nb.metadata)

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

function outputsToNbformat(outputs: CellOutput[], execution_count: number | null): unknown[] {
  const out: unknown[] = []
  for (const o of outputs) {
    if (o.output_type === 'stream') {
      out.push(streamOutputToNbformat(o))
    } else if (o.output_type === 'execute_result') {
      out.push(executeResultToNbformat(o, execution_count))
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
