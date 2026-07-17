import { describe, it, expect } from 'vitest'
import {
  buildCriblSearchMagicSource,
  convertCriblSearchNotebook,
} from '@features/notebook/codec/criblSearchNotebookConverter'
import type { CriblSearchNotebookData } from '@/domain/criblSearchNotebook'

describe('buildCriblSearchMagicSource', () => {
  it('builds header with time range and query body', () => {
    const source = buildCriblSearchMagicSource({
      kind: 'search',
      query: 'cribl dataset="sample" | limit 100',
      earliest: '-1h',
      latest: 'now',
    })
    expect(source).toBe(
      '%%cribl_search lang=kql earliest=-1h latest=now\ncribl dataset="sample" | limit 100',
    )
  })

  it('omits earliest/latest when absent', () => {
    const source = buildCriblSearchMagicSource({
      kind: 'search',
      query: 'cribl | limit 10',
    })
    expect(source).toBe('%%cribl_search lang=kql\ncribl | limit 10')
  })

  it('includes numeric epoch earliest/latest as strings', () => {
    const source = buildCriblSearchMagicSource({
      kind: 'search',
      query: 'cribl dataset=pan | stats count()',
      earliest: '1781781181',
      latest: '1781783881',
    })
    expect(source).toBe(
      '%%cribl_search lang=kql earliest=1781781181 latest=1781783881\ncribl dataset=pan | stats count()',
    )
  })
})

describe('convertCriblSearchNotebook', () => {
  const sample: CriblSearchNotebookData = {
    id: 'nb-1',
    name: 'Threat Hunt',
    cells: [
      {
        kind: 'note',
        content: '# Overview\n\nStart here.',
      },
      {
        kind: 'search',
        title: 'Sample query',
        query: 'cribl dataset="sample" | limit 50',
        earliest: '-24h',
        latest: 'now',
      },
      {
        kind: 'search',
        query: 'cribl | limit 5',
      },
    ],
  }

  it('maps title and cells', () => {
    const { title, cells } = convertCriblSearchNotebook(sample)
    expect(title).toBe('Threat Hunt')
    expect(cells).toHaveLength(4)
    expect(cells[0].cell_type).toBe('markdown')
    expect(cells[0].source).toContain('# Overview')
    expect(cells[1].cell_type).toBe('markdown')
    expect(cells[1].source).toBe('## Sample query')
    expect(cells[2].cell_type).toBe('code')
    expect(cells[2].source).toContain('%%cribl_search lang=kql earliest=-24h latest=now')
    expect(cells[3].cell_type).toBe('code')
    expect(cells[3].source).toContain('cribl | limit 5')
  })

  it('returns empty cells array when notebook has no cells', () => {
    const { cells } = convertCriblSearchNotebook({ id: 'x', name: 'Empty', cells: [] })
    expect(cells).toEqual([])
  })
})
