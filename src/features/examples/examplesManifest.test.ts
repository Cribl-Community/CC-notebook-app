import { describe, expect, it } from 'vitest'
import { exampleNotebookDisplayLabel, parseExamplesManifest } from '@features/examples/examplesManifest'

describe('parseExamplesManifest', () => {
  it('accepts v1 manifest and fills defaults', () => {
    expect(parseExamplesManifest({ version: 1, notebooks: ['a.ipynb'] })).toEqual([
      {
        filename: 'a.ipynb',
        title: 'a',
        summary: 'Bundled example notebook.',
        tags: [],
        level: 'beginner',
        estimatedRuntime: '5-10 min',
        recommendedOrder: 1,
      },
    ])
  })

  it('accepts v2 descriptor manifest', () => {
    expect(
      parseExamplesManifest({
        version: 2,
        notebooks: [
          {
            filename: 'a.ipynb',
            title: 'A title',
            summary: 'A summary',
            tags: ['search'],
            level: 'intermediate',
            estimatedRuntime: '8 min',
            recommendedOrder: 2,
          },
        ],
      }),
    ).toEqual([
      {
        filename: 'a.ipynb',
        title: 'A title',
        summary: 'A summary',
        tags: ['search'],
        level: 'intermediate',
        estimatedRuntime: '8 min',
        recommendedOrder: 2,
      },
    ])
  })

  it('rejects wrong version', () => {
    expect(parseExamplesManifest({ version: 3, notebooks: [] })).toBeNull()
  })

  it('rejects invalid v2 entries', () => {
    expect(parseExamplesManifest({ version: 2, notebooks: [{ title: 'missing filename' }] })).toBeNull()
  })
})

describe('exampleNotebookDisplayLabel', () => {
  it('strips extension and underscores', () => {
    expect(exampleNotebookDisplayLabel('Cribl_Search_Example.ipynb')).toBe('Cribl Search Example')
  })
})
