import { describe, it, expect } from 'vitest'
import {
  normalizeCriblSearchNotebookCell,
  normalizeCriblSearchNotebookData,
  normalizeCriblSearchNotebookList,
  normalizeCriblSearchNotebookMeta,
} from '@/domain/criblSearchNotebook'

describe('criblSearchNotebook normalizers', () => {
  it('normalizes list items', () => {
    const items = normalizeCriblSearchNotebookList({
      items: [{ id: '1', name: 'One' }, { id: '2', title: 'Two' }, { bad: true }],
    })
    expect(items).toEqual([{ id: '1', name: 'One' }, { id: '2', name: 'Two' }])
  })

  it('infers search cells without explicit type', () => {
    const cell = normalizeCriblSearchNotebookCell({
      query: 'cribl | limit 1',
      earliest: '-1h',
    })
    expect(cell).toEqual({
      kind: 'search',
      query: 'cribl | limit 1',
      earliest: '-1h',
    })
  })

  it('infers note cells from markdown field', () => {
    const cell = normalizeCriblSearchNotebookCell({ type: 'note', markdown: '## Hi' })
    expect(cell).toEqual({ kind: 'note', content: '## Hi' })
  })

  it('skips unknown cells when normalizing notebook', () => {
    const nb = normalizeCriblSearchNotebookData({
      id: 'x',
      name: 'Test',
      cells: [{ type: 'chart' }, { type: 'note', text: 'ok' }],
    })
    expect(nb.cells).toEqual([{ kind: 'note', content: 'ok' }])
  })

  it('normalizes meta with updatedAt', () => {
    expect(normalizeCriblSearchNotebookMeta({ id: 'a', name: 'A', updatedAt: 99 })).toEqual({
      id: 'a',
      name: 'A',
      updatedAt: 99,
    })
  })
})
