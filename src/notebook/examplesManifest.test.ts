import { describe, expect, it } from 'vitest'
import { exampleNotebookDisplayLabel, parseExamplesManifest } from './examplesManifest'

describe('parseExamplesManifest', () => {
  it('accepts v1 manifest', () => {
    expect(parseExamplesManifest({ version: 1, notebooks: ['a.ipynb'] })).toEqual(['a.ipynb'])
  })
  it('rejects wrong version', () => {
    expect(parseExamplesManifest({ version: 2, notebooks: [] })).toBeNull()
  })
  it('rejects non-string entries', () => {
    expect(parseExamplesManifest({ version: 1, notebooks: [1] })).toBeNull()
  })
})

describe('exampleNotebookDisplayLabel', () => {
  it('strips extension and underscores', () => {
    expect(exampleNotebookDisplayLabel('Cribl_Search_Example.ipynb')).toBe('Cribl Search Example')
  })
})
