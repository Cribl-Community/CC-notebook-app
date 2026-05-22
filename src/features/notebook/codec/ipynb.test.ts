import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from 'vitest'
import {
  filenameStemToDisplayTitle,
  resolveImportedNotebookTitle,
  parseIpynbJson,
  serializeNotebookToIpynbJson,
} from '@features/notebook/codec/ipynb'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
import type { NotebookState } from '@features/notebook/model/types'
import { CRIBL_SEARCH_MIME } from '@/domain/criblSearchMime'

const readyKernelInit: NotebookState['kernelInit'] = {
  phase: 'ready',
  message: 'Python kernel ready',
  progressPercent: 100,
  startedAtMs: null,
  errorSummary: null,
  errorDetail: null,
}

function minimalNotebook(metadata: Record<string, unknown>): string {
  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata,
    cells: [{ cell_type: 'code', source: '', outputs: [] }],
  })
}

describe('filenameStemToDisplayTitle', () => {
  it('strips .ipynb', () => {
    expect(filenameStemToDisplayTitle('MyBook.ipynb')).toBe('MyBook')
  })
  it('matches extension case-insensitively', () => {
    expect(filenameStemToDisplayTitle('x.IPYNB')).toBe('x')
  })
  it('uses last path segment', () => {
    expect(filenameStemToDisplayTitle('a/b/MyBook.ipynb')).toBe('MyBook')
  })
  it('returns null when unusable', () => {
    expect(filenameStemToDisplayTitle('')).toBeNull()
    expect(filenameStemToDisplayTitle('.ipynb')).toBeNull()
  })
})

describe('resolveImportedNotebookTitle', () => {
  it('prefers non-generic metadata over filename', () => {
    expect(resolveImportedNotebookTitle('Report', 'other.ipynb')).toBe('Report')
  })
  it('uses filename stem when metadata is Untitled', () => {
    expect(resolveImportedNotebookTitle('Untitled', 'analysis.ipynb')).toBe('analysis')
  })
  it('falls back to Untitled', () => {
    expect(resolveImportedNotebookTitle('Untitled')).toBe('Untitled')
  })
})

describe('parseIpynbJson', () => {
  it('keeps title from metadata when present', () => {
    const json = minimalNotebook({ title: 'My Export' })
    const r = parseIpynbJson(json, { filename: 'ignored.ipynb' })
    expect(r.title).toBe('My Export')
  })
  it('uses upload filename when metadata has no title', () => {
    const json = minimalNotebook({})
    const r = parseIpynbJson(json, { filename: 'disk.ipynb' })
    expect(r.title).toBe('disk')
  })
  it('normalizes double-escaped newlines in cell source strings', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'T' },
      cells: [{ cell_type: 'markdown', source: 'Line one\\nLine two' }],
    })
    const r = parseIpynbJson(json)
    const c = r.cells[0]
    expect(c?.cell_type).toBe('markdown')
    if (c?.cell_type !== 'markdown') return
    expect(c.source).toBe('Line one\nLine two')
  })
  it('reads code_folded from cell.metadata.notebook_app', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'T' },
      cells: [
        {
          cell_type: 'code',
          source: 'x',
          outputs: [],
          metadata: { notebook_app: { code_folded: true } },
        },
      ],
    })
    const r = parseIpynbJson(json)
    const c = r.cells[0]
    expect(c?.cell_type).toBe('code')
    if (c?.cell_type !== 'code') return
    expect(c.codeFolded).toBe(true)
  })
  it('parses stream text as string array', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'T' },
      cells: [
        {
          cell_type: 'code',
          source: 'x',
          execution_count: 1,
          outputs: [{ output_type: 'stream', name: 'stdout', text: ['a', 'b'] }],
        },
      ],
    })
    const r = parseIpynbJson(json)
    const c = r.cells[0]
    expect(c?.cell_type).toBe('code')
    if (c?.cell_type !== 'code') return
    expect(c.outputs[0]).toEqual({
      output_type: 'stream',
      name: 'stdout',
      text: 'ab',
    })
    expect(c.execution_count).toBe(1)
  })
  it('parses error output', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'T' },
      cells: [
        {
          cell_type: 'code',
          source: 'raise',
          outputs: [
            {
              output_type: 'error',
              ename: 'ValueError',
              evalue: 'bad',
              traceback: ['line1', 'line2'],
            },
          ],
        },
      ],
    })
    const r = parseIpynbJson(json)
    const c = r.cells[0]
    if (c?.cell_type !== 'code') throw new Error('expected code cell')
    expect(c.outputs[0]).toEqual({
      output_type: 'error',
      ename: 'ValueError',
      evalue: 'bad',
      traceback: ['line1', 'line2'],
    })
  })
  it('parses display_data with full mime bundle', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'T' },
      cells: [
        {
          cell_type: 'code',
          source: 'x',
          outputs: [
            {
              output_type: 'display_data',
              data: {
                'text/plain': 'fallback',
                'text/html': ['<p>', 'hi', '</p>'],
              },
              metadata: { isolated: true },
              transient: { display_id: 'd1' },
            },
          ],
        },
      ],
    })
    const r = parseIpynbJson(json)
    const c = r.cells[0]
    if (c?.cell_type !== 'code') throw new Error('expected code cell')
    expect(c.outputs[0]).toEqual({
      output_type: 'display_data',
      data: { 'text/plain': 'fallback', 'text/html': '<p>hi</p>' },
      metadata: { isolated: true },
      display_id: 'd1',
    })
  })
})

describe('bundled public/Examples ipynb files', () => {
  it('parses every shipped example without throwing', () => {
    const dir = join(repoRoot, 'public', 'Examples')
    const names = readdirSync(dir).filter((f) => f.endsWith('.ipynb'))
    expect(names.length).toBeGreaterThan(0)
    for (const filename of names) {
      const text = readFileSync(join(dir, filename), 'utf8')
      expect(() => parseIpynbJson(text, { filename })).not.toThrow()
    }
  })

  it('Cribl API examples use normal YAML double-quotes in %%cribl_api POST bodies (no stray backslashes)', () => {
    const text = readFileSync(join(repoRoot, 'public', 'Examples', 'Cribl_API_Examples.ipynb'), 'utf8')
    expect(text).not.toMatch(/\\\\\\"/)
    const { cells } = parseIpynbJson(text, { filename: 'Cribl_API_Examples.ipynb' })
    const templated = cells.find(
      (c) => c.cell_type === 'code' && c.source.includes('var=templated_job'),
    )
    expect(templated?.cell_type).toBe('code')
    if (templated?.cell_type !== 'code') return
    expect(templated.source).toContain('dataset="{{ api_dataset }}"')
    expect(templated.source.includes('\\"')).toBe(false)
  })
})

describe('serializeNotebookToIpynbJson cribl_search', () => {
  it('round-trips cribl_search payload through generic display_data', () => {
    const payload = {
      kind: 'completed' as const,
      columns: ['_raw'],
      rows: [{ _raw: 'e1' }],
      recordsReturned: 1,
      totalRecords: null as number | null,
      dataframeVar: 'results_df',
    }
    const state: NotebookState = {
      title: 'T',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: '%%cribl_search\nq\n',
          outputs: [
            {
              output_type: 'display_data',
              data: {
                'text/plain': 'Cribl Search: 1 records',
                [CRIBL_SEARCH_MIME]: JSON.stringify(payload),
              },
              metadata: {},
              display_id: 'cribl-search-c1',
            },
          ],
          execution_count: 1,
          execution_state: 'idle',
        },
      ],
      selectedId: null,
      executionCounter: 0,
      kernelStatus: 'ready',
      kernelInit: readyKernelInit,
    }
    const json = serializeNotebookToIpynbJson(state)
    const { cells } = parseIpynbJson(json)
    const c = cells[0]
    expect(c?.cell_type).toBe('code')
    if (c?.cell_type !== 'code') return
    expect(c.outputs).toHaveLength(1)
    const out = c.outputs[0]
    if (out.output_type !== 'display_data') throw new Error('expected display_data')
    expect(out.data[CRIBL_SEARCH_MIME]).toBe(JSON.stringify(payload))
    expect(out.display_id).toBe('cribl-search-c1')
  })
})

describe('serializeNotebookToIpynbJson round-trip', () => {
  function minimalState(overrides: Partial<NotebookState> = {}): NotebookState {
    const base: NotebookState = {
      title: 'RT',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: 'print(1)',
          outputs: [
            { output_type: 'stream', name: 'stdout', text: 'hello\n' },
            {
              output_type: 'execute_result',
              execution_count: 3,
              data: { 'text/plain': '42' },
              metadata: {},
            },
          ],
          execution_count: 3,
          execution_state: 'idle',
        },
      ],
      selectedId: null,
      executionCounter: 0,
      kernelStatus: 'ready',
      kernelInit: readyKernelInit,
    }
    return {
      ...base,
      ...overrides,
      kernelInit: overrides.kernelInit ?? base.kernelInit,
    }
  }

  it('preserves sources, outputs, execution counts, and title', () => {
    const state = minimalState()
    const before = state.cells[0]
    expect(before?.cell_type).toBe('code')
    if (before?.cell_type !== 'code') return

    const json = serializeNotebookToIpynbJson(state)
    const { title, cells } = parseIpynbJson(json)
    expect(title).toBe('RT')
    expect(cells).toHaveLength(1)
    const c = cells[0]
    expect(c?.cell_type).toBe('code')
    if (c?.cell_type !== 'code') return
    expect(c.source).toBe('print(1)')
    expect(c.execution_count).toBe(3)
    expect(c.outputs).toEqual(before.outputs)
  })

  it('preserves text/html mime and display_id round trip', () => {
    const state: NotebookState = {
      title: 'HTML',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: 'show(df)',
          outputs: [
            {
              output_type: 'display_data',
              data: { 'text/plain': 't', 'text/html': '<table><tr><td>1</td></tr></table>' },
              metadata: {},
              display_id: 'd-table',
            },
          ],
          execution_count: 1,
          execution_state: 'idle',
        },
      ],
      selectedId: null,
      executionCounter: 0,
      kernelStatus: 'ready',
      kernelInit: readyKernelInit,
    }
    const json = serializeNotebookToIpynbJson(state)
    const { cells } = parseIpynbJson(json)
    const c = cells[0]
    if (c?.cell_type !== 'code') throw new Error('expected code cell')
    expect(c.outputs).toEqual(state.cells[0]!.cell_type === 'code' ? state.cells[0]!.outputs : [])
  })

  it('preserves code_folded in cell metadata round trip', () => {
    const state: NotebookState = {
      title: 'Fold',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: `${[...Array(11)].map((_, i) => i).join('\n')}\n`,
          outputs: [],
          execution_count: null,
          execution_state: 'idle',
          codeFolded: true,
        },
      ],
      selectedId: 'c1',
      executionCounter: 0,
      kernelStatus: 'ready',
      kernelInit: readyKernelInit,
    }
    const json = serializeNotebookToIpynbJson(state)
    const { cells } = parseIpynbJson(json)
    const c = cells[0]
    expect(c?.cell_type === 'code' && c.codeFolded).toBe(true)
  })

  it('preserves cell_enabled and run_condition in cell metadata round trip', () => {
    const state: NotebookState = {
      title: 'Meta',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: 'print(1)',
          outputs: [],
          execution_count: null,
          execution_state: 'idle',
          enabled: false,
          runCondition: '1 > 2',
        },
      ],
      selectedId: 'c1',
      executionCounter: 0,
      kernelStatus: 'ready',
      kernelInit: readyKernelInit,
    }
    const json = serializeNotebookToIpynbJson(state)
    const { cells } = parseIpynbJson(json)
    const c = cells[0]
    expect(c?.cell_type === 'code' && c.enabled === false).toBe(true)
    expect(c?.cell_type === 'code' && c.runCondition).toBe('1 > 2')
  })
})
