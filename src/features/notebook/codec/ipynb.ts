import type { Cell, CodeCell, MarkdownCell, NotebookState } from '@features/notebook/model/types'
import {
  codeCellMetadataForIpynb,
  parseCodeFoldedFromCellMetadata,
} from '@features/notebook/codeCellFold'
import type { MimeBundle, MimeMetadata, OutputRecord } from '@/domain/kernel'

const NBFORMAT = 4
const NBFORMAT_MINOR = 5

function normalizeSource(source: unknown): string {
  const normalizeEscapedNewlines = (text: string): string => {
    // Some imported notebooks may accidentally double-escape newlines ("\\n").
    // If there are no real newlines, normalize to rendered line breaks.
    if (text.includes('\\n') && !text.includes('\n')) return text.replace(/\\n/g, '\n')
    return text
  }
  if (typeof source === 'string') return normalizeEscapedNewlines(source)
  if (Array.isArray(source)) return normalizeEscapedNewlines(source.join(''))
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

/**
 * Per nbformat 4.x, mime bundle values may be a string or an array of strings.
 * We always normalize to a single string in memory; binary mimes (image/png,
 * image/jpeg) are stored as base64 strings as on disk.
 */
function normalizeMimeBundle(data: unknown): MimeBundle {
  if (!data || typeof data !== 'object') return {}
  const out: MimeBundle = {}
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    if (typeof v === 'string') {
      out[k] = v
    } else if (Array.isArray(v)) {
      const joined = v.filter((x): x is string => typeof x === 'string').join('')
      out[k] = joined
    } else if (v != null && typeof v === 'object') {
      try {
        out[k] = JSON.stringify(v)
      } catch {
        // skip
      }
    }
  }
  return out
}

function normalizeMetadata(m: unknown): MimeMetadata {
  if (m && typeof m === 'object' && !Array.isArray(m)) return m as MimeMetadata
  return {}
}

function extractDisplayId(o: Record<string, unknown>): string | undefined {
  const t = o.transient
  if (t && typeof t === 'object' && !Array.isArray(t)) {
    const id = (t as Record<string, unknown>).display_id
    if (typeof id === 'string') return id
  }
  return undefined
}

function parseNbformatOutput(raw: unknown): OutputRecord | null {
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
    const data = normalizeMimeBundle(o.data)
    if (Object.keys(data).length === 0) return null
    const display_id = extractDisplayId(o)
    return {
      output_type: 'display_data',
      data,
      metadata: normalizeMetadata(o.metadata),
      ...(display_id ? { display_id } : {}),
    }
  }
  if (ot === 'execute_result') {
    const data = normalizeMimeBundle(o.data)
    if (Object.keys(data).length === 0) return null
    const display_id = extractDisplayId(o)
    return {
      output_type: 'execute_result',
      execution_count: parseExecutionCount(o.execution_count),
      data,
      metadata: normalizeMetadata(o.metadata),
      ...(display_id ? { display_id } : {}),
    }
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
  const outputs: OutputRecord[] = []
  const rawOut = cell.outputs
  if (Array.isArray(rawOut)) {
    for (const item of rawOut) {
      const parsed = parseNbformatOutput(item)
      if (parsed) outputs.push(parsed)
    }
  }

  const codeFolded = parseCodeFoldedFromCellMetadata(cell.metadata)

  return {
    id: crypto.randomUUID(),
    cell_type: 'code',
    source: normalizeSource(cell.source),
    outputs,
    execution_count: parseExecutionCount(cell.execution_count),
    execution_state: 'idle',
    ...(codeFolded !== undefined ? { codeFolded } : {}),
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
 * Code cell outputs and execution counts are loaded from the file. Full mime
 * bundles are preserved for `display_data` and `execute_result`.
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

function streamOutputToNbformat(o: Extract<OutputRecord, { output_type: 'stream' }>) {
  return {
    output_type: 'stream' as const,
    name: o.name,
    text: o.text,
  }
}

function executeResultToNbformat(o: Extract<OutputRecord, { output_type: 'execute_result' }>) {
  const transient = o.display_id ? { transient: { display_id: o.display_id } } : {}
  return {
    output_type: 'execute_result' as const,
    execution_count: o.execution_count,
    data: { ...o.data },
    metadata: { ...o.metadata },
    ...transient,
  }
}

function displayDataToNbformat(o: Extract<OutputRecord, { output_type: 'display_data' }>) {
  const transient = o.display_id ? { transient: { display_id: o.display_id } } : {}
  return {
    output_type: 'display_data' as const,
    data: { ...o.data },
    metadata: { ...o.metadata },
    ...transient,
  }
}

function errorOutputToNbformat(o: Extract<OutputRecord, { output_type: 'error' }>) {
  return {
    output_type: 'error' as const,
    ename: o.ename,
    evalue: o.evalue,
    traceback: o.traceback,
  }
}

function outputsToNbformat(outputs: OutputRecord[]): unknown[] {
  const out: unknown[] = []
  for (const o of outputs) {
    if (o.output_type === 'stream') {
      out.push(streamOutputToNbformat(o))
    } else if (o.output_type === 'execute_result') {
      out.push(executeResultToNbformat(o))
    } else if (o.output_type === 'display_data') {
      out.push(displayDataToNbformat(o))
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
        metadata: codeCellMetadataForIpynb(cell.codeFolded),
        outputs: outputsToNbformat(cell.outputs),
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
