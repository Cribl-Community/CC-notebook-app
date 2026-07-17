import type { Cell, CodeCell, MarkdownCell } from '@features/notebook/model/types'
import type {
  CriblSearchNotebookCell,
  CriblSearchNotebookData,
  CriblSearchNotebookSearchCell,
} from '@/domain/criblSearchNotebook'

function makeCodeCell(source: string): CodeCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'code',
    source,
    outputs: [],
    execution_count: null,
    execution_state: 'idle',
    codeFolded: true,
  }
}

function makeMarkdownCell(source: string): MarkdownCell {
  return {
    id: crypto.randomUUID(),
    cell_type: 'markdown',
    source,
    editing: false,
  }
}

/** Build `%%cribl_search` cell source from a Cribl Search Notebook search cell. */
export function buildCriblSearchMagicSource(cell: CriblSearchNotebookSearchCell): string {
  const params: string[] = ['lang=kql']
  if (cell.earliest) params.push(`earliest=${cell.earliest}`)
  if (cell.latest) params.push(`latest=${cell.latest}`)
  const header = `%%cribl_search ${params.join(' ')}`
  return `${header}\n${cell.query.trim()}`
}

function convertCell(cell: CriblSearchNotebookCell): Cell[] {
  if (cell.kind === 'note') {
    return [makeMarkdownCell(cell.content)]
  }
  const out: Cell[] = []
  if (cell.title?.trim()) {
    out.push(makeMarkdownCell(`## ${cell.title.trim()}`))
  }
  out.push(makeCodeCell(buildCriblSearchMagicSource(cell)))
  return out
}

/** Convert a normalized Cribl Search Notebook into in-memory Jupyter-style cells. */
export function convertCriblSearchNotebook(raw: CriblSearchNotebookData): { title: string; cells: Cell[] } {
  const cells = raw.cells.flatMap(convertCell)
  return { title: raw.name, cells }
}
