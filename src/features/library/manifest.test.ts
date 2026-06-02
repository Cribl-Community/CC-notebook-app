import { describe, expect, it } from 'vitest'
import {
  buildTreeRows,
  collectSubtreeIds,
  emptyManifest,
  filterManifestItemsByTagSelection,
  isUnderFolder,
  listMoveTargets,
  normalizeManifestTagList,
  parseManifestJson,
  siblingNameTaken,
  type ManifestItem,
} from '@features/library/manifest'
import { manifestSetNotebookTags } from '@features/library/notebookLibrary'

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
      tags: [],
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

  it('parses notebook tags and defaults invalid tags to empty', () => {
    const text = JSON.stringify({
      version: 1,
      items: [
        {
          id: 'n1',
          type: 'notebook',
          parentId: null,
          name: 'A',
          updatedAt: '2020-01-01',
          tags: [' x ', 'y', 'x', 1, 'y'],
        },
      ],
    })
    const m = parseManifestJson(text)
    expect(m.items).toHaveLength(1)
    const n = m.items[0]
    expect(n.type).toBe('notebook')
    if (n.type === 'notebook') expect(n.tags).toEqual(['x', 'y'])
  })

  it('parses notebook without tags field as empty', () => {
    const m = parseManifestJson(
      JSON.stringify({
        version: 1,
        items: [
          {
            id: 'n1',
            type: 'notebook',
            parentId: null,
            name: 'A',
            updatedAt: '2020-01-01',
          },
        ],
      }),
    )
    const n = m.items[0]
    expect(n?.type).toBe('notebook')
    if (n?.type === 'notebook') expect(n.tags).toEqual([])
  })
})

describe('normalizeManifestTagList', () => {
  it('trims and dedupes', () => {
    expect(normalizeManifestTagList([' a ', 'b', 'a', ''])).toEqual(['a', 'b'])
  })
})

describe('filterManifestItemsByTagSelection', () => {
  it('returns all items when no tags selected', () => {
    const items = sampleItems()
    expect(filterManifestItemsByTagSelection(items, new Set())).toEqual(items)
  })

  it('keeps OR-matching notebooks and ancestor folders', () => {
    const items: ManifestItem[] = [
      { id: 'f1', type: 'folder', parentId: null, name: 'F', updatedAt: '1' },
      {
        id: 'n1',
        type: 'notebook',
        parentId: 'f1',
        name: 'A',
        updatedAt: '1',
        tags: ['search'],
      },
      {
        id: 'n2',
        type: 'notebook',
        parentId: null,
        name: 'B',
        updatedAt: '1',
        tags: ['api'],
      },
    ]
    const out = filterManifestItemsByTagSelection(items, new Set(['search']))
    expect(out.map((i) => i.id).sort()).toEqual(['f1', 'n1'])
  })
})

describe('manifestSetNotebookTags', () => {
  it('updates tags on a notebook entry', () => {
    const items: ManifestItem[] = [
      { id: 'n1', type: 'notebook', parentId: null, name: 'A', updatedAt: 'old', tags: [] },
    ]
    const r = manifestSetNotebookTags({ version: 1, items }, 'n1', ['z', ' z '])
    if ('error' in r) throw new Error('unexpected error')
    const n = r.manifest.items[0]
    expect(n?.type).toBe('notebook')
    if (n?.type === 'notebook') expect(n.tags).toEqual(['z'])
  })
})

describe('siblingNameTaken', () => {
  it('detects duplicate names in same folder', () => {
    const items: ManifestItem[] = [
      { id: 'a', type: 'notebook', parentId: null, name: 'x', updatedAt: '', tags: [] },
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
