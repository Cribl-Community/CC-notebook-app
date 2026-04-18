import { describe, it, expect } from 'vitest'
import {
  filenameStemToDisplayTitle,
  resolveImportedNotebookTitle,
  parseIpynbJson,
} from './ipynb'

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
})
