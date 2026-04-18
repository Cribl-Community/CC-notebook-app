import { describe, expect, it } from 'vitest'
import {
  buildTreeRows,
  collectSubtreeIds,
  emptyManifest,
  isUnderFolder,
  listMoveTargets,
  parseManifestJson,
  siblingNameTaken,
  type ManifestItem,
} from './manifest'

function sampleItems(): ManifestItem[] {
  const f1 = 'folder-1'
  const f2 = 'folder-2'
  return [
    { id: f1, type: 'folder', parentId: null, name: 'Alpha', updatedAt: '2020-01-01' },
    { id: f2, type: 'folder', parentId: f1, name: 'Beta', updatedAt: '2020-01-01' },
    {
      id: 'nb-1',
      type: 'notebook',
      parentId: f2,
      name: 'nb',
      updatedAt: '2020-01-01',
    },
  ]
}

describe('parseManifestJson', () => {
  it('parses valid manifest', () => {
    const m = parseManifestJson(
      JSON.stringify({ version: 1, items: sampleItems() }),
    )
    expect(m.items).toHaveLength(3)
  })

  it('throws on bad json', () => {
    expect(() => parseManifestJson('not json')).toThrow()
  })
})

describe('siblingNameTaken', () => {
  it('detects duplicate names in same folder', () => {
    const items: ManifestItem[] = [
      { id: 'a', type: 'notebook', parentId: null, name: 'x', updatedAt: '' },
    ]
    expect(siblingNameTaken(items, null, 'x')).toBe(true)
    expect(siblingNameTaken(items, null, 'x', 'a')).toBe(false)
  })
})

describe('isUnderFolder', () => {
  it('detects when new parent is inside moved folder subtree', () => {
    const items = sampleItems()
    expect(isUnderFolder(items, 'folder-1', 'folder-2')).toBe(true)
    expect(isUnderFolder(items, 'folder-1', 'nb-1')).toBe(true)
    expect(isUnderFolder(items, 'folder-2', 'folder-1')).toBe(false)
  })
})

describe('collectSubtreeIds', () => {
  it('includes nested notebooks', () => {
    const items = sampleItems()
    const s = collectSubtreeIds(items, 'folder-1')
    expect(s.has('folder-1')).toBe(true)
    expect(s.has('folder-2')).toBe(true)
    expect(s.has('nb-1')).toBe(true)
  })
})

describe('listMoveTargets', () => {
  it('excludes subtree when moving a folder', () => {
    const items = sampleItems()
    const opts = listMoveTargets(items, 'folder-1')
    const ids = opts.map((o) => o.id)
    expect(ids).not.toContain('folder-1')
    expect(ids).not.toContain('folder-2')
    expect(ids).toContain(null)
  })
})

describe('buildTreeRows', () => {
  it('orders depth-first', () => {
    const rows = buildTreeRows(sampleItems())
    expect(rows.map((r) => r.item.name)).toEqual(['Alpha', 'Beta', 'nb'])
    expect(rows.map((r) => r.depth)).toEqual([0, 1, 2])
  })

  it('handles empty manifest', () => {
    expect(buildTreeRows(emptyManifest().items)).toEqual([])
  })
})
