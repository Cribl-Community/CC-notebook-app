import { describe, expect, it } from 'vitest'
import { filterItemsByAnyTag } from './tagFilter'

describe('filterItemsByAnyTag', () => {
  const items = [
    { id: 'a', tags: ['search', 'api'] },
    { id: 'b', tags: ['pandas'] },
    { id: 'c', tags: [] },
  ]

  it('returns all items when no tags selected', () => {
    expect(filterItemsByAnyTag(items, new Set())).toEqual(items)
  })

  it('matches OR across selected tags', () => {
    expect(filterItemsByAnyTag(items, new Set(['search']))).toEqual([items[0]])
    expect(filterItemsByAnyTag(items, new Set(['pandas', 'api']))).toEqual([items[0], items[1]])
  })

  it('excludes items with no overlap', () => {
    expect(filterItemsByAnyTag(items, new Set(['nope']))).toEqual([])
  })
})
