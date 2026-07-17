import { describe, it, expect } from 'vitest'
import {
  normalizeCriblSearchNotebookData,
  normalizeCriblSearchNotebookList,
  normalizeCriblSearchNotebookMeta,
  normalizeCriblSearchNotebookSection,
  unwrapCriblSearchNotebookPayload,
} from '@/domain/criblSearchNotebook'

describe('criblSearchNotebook normalizers', () => {
  it('normalizes list items with info.name (Cribl Search API shape)', () => {
    const items = normalizeCriblSearchNotebookList({
      items: [
        {
          id: 'notebook-abc',
          info: { name: 'Threat Hunt', modified: 1700000000000 },
        },
        { id: '2', name: 'Legacy flat name' },
        { id: '3', info: {} },
      ],
    })
    expect(items).toEqual([
      { id: 'notebook-abc', name: 'Threat Hunt', updatedAt: 1700000000000 },
      { id: '2', name: 'Legacy flat name' },
    ])
  })

  it('unwraps GET detail responses with items[0]', () => {
    const payload = {
      items: [
        {
          id: 'notebook-abc',
          info: { name: 'My Notebook' },
          sections: [],
        },
      ],
    }
    expect(unwrapCriblSearchNotebookPayload(payload)).toEqual(payload.items[0])
  })

  it('normalizes markdown sections from config.markdown', () => {
    const section = normalizeCriblSearchNotebookSection({
      id: 'section-1',
      type: 'markdown.default',
      variant: 'markdown',
      config: { markdown: '## Notes\n\nHello' },
      info: { title: '' },
    })
    expect(section).toEqual({ kind: 'note', content: '## Notes\n\nHello' })
  })

  it('normalizes search sections from config.query', () => {
    const section = normalizeCriblSearchNotebookSection({
      id: 'section-2',
      type: 'search.default',
      variant: 'search',
      config: {
        query: 'cribl dataset="sample" | limit 10',
        earliest: '-1h',
        latest: 'now',
      },
      info: { title: 'Sample search' },
    })
    expect(section).toEqual({
      kind: 'search',
      title: 'Sample search',
      query: 'cribl dataset="sample" | limit 10',
      earliest: '-1h',
      latest: 'now',
    })
  })

  it('normalizes full notebook with sections', () => {
    const nb = normalizeCriblSearchNotebookData({
      items: [
        {
          id: 'notebook-abc',
          info: { name: 'Investigation' },
          sections: [
            {
              variant: 'markdown',
              config: { markdown: '# Intro' },
            },
            {
              variant: 'search',
              config: { query: 'cribl | limit 5' },
              info: { title: 'Q1' },
            },
          ],
        },
      ],
    })
    expect(nb).toEqual({
      id: 'notebook-abc',
      name: 'Investigation',
      cells: [
        { kind: 'note', content: '# Intro' },
        { kind: 'search', title: 'Q1', query: 'cribl | limit 5' },
      ],
    })
  })

  it('normalizes meta with updatedAt from info.modified', () => {
    expect(
      normalizeCriblSearchNotebookMeta({
        id: 'a',
        info: { name: 'A', modified: 99 },
      }),
    ).toEqual({
      id: 'a',
      name: 'A',
      updatedAt: 99,
    })
  })
})
