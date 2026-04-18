import { describe, it, expect } from 'vitest'
import { computeFieldCounts, deriveColumnNames } from './searchResultModel'

describe('searchResultModel', () => {
  it('deriveColumnNames sorts keys', () => {
    expect(deriveColumnNames([{ z: 1, a: 2 }])).toEqual(['a', 'z'])
  })

  it('computeFieldCounts counts non-empty', () => {
    const rows = [
      { a: 1, b: '' },
      { a: 2, b: 'x' },
    ]
    const cols = ['a', 'b']
    const fc = computeFieldCounts(rows, cols)
    expect(fc).toContainEqual(['a', 2])
    expect(fc).toContainEqual(['b', 1])
  })
})
