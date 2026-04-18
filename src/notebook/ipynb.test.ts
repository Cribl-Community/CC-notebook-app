import { describe, it, expect } from 'vitest'
import {
  filenameStemToDisplayTitle,
  resolveImportedNotebookTitle,
  parseIpynbJson,
  serializeNotebookToIpynbJson,
} from './ipynb'
import type { NotebookState } from './types'

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
})

describe('serializeNotebookToIpynbJson round-trip', () => {
  function minimalState(overrides: Partial<NotebookState> = {}): NotebookState {
    return {
      title: 'RT',
      cells: [
        {
          id: 'c1',
          cell_type: 'code',
          source: 'print(1)',
          outputs: [
            { output_type: 'stream', name: 'stdout', text: 'hello\n' },
            { output_type: 'execute_result', data: '42' },
          ],
          execution_count: 3,
          execution_state: 'idle',
        },
      ],
      selectedId: null,
      executionCounter: 0,
      kernelStatus: 'ready',
      ...overrides,
    }
  }

  it('preserves sources, outputs, execution counts, and title', () => {
    const state = minimalState()
    const json = serializeNotebookToIpynbJson(state)
    const { title, cells } = parseIpynbJson(json)
    expect(title).toBe('RT')
    expect(cells).toHaveLength(1)
    const c = cells[0]
    expect(c?.cell_type).toBe('code')
    if (c?.cell_type !== 'code') return
    expect(c.source).toBe('print(1)')
    expect(c.execution_count).toBe(3)
    expect(c.outputs).toEqual(state.cells[0]?.outputs)
  })
})
