/** KV key prefix for this app’s notebook library. */
import type { Manifest, ManifestItem } from '@/domain/library'

export const NB_KV_PREFIX = 'nb/v1'

export const MANIFEST_KEY = `${NB_KV_PREFIX}/manifest`

export function notebookPayloadKey(notebookId: string): string {
  return `${NB_KV_PREFIX}/notebooks/${notebookId}`
}

export type { Manifest, ManifestItem }

export function emptyManifest(): Manifest {
  return { version: 1, items: [] }
}

export function parseManifestJson(text: string): Manifest {
  let root: unknown
  try {
    root = JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid manifest JSON')
  }
  if (!root || typeof root !== 'object') throw new Error('Manifest must be an object')
  const m = root as Record<string, unknown>
  if (m.version !== 1) throw new Error('Unsupported manifest version')
  const items = m.items
  if (!Array.isArray(items)) throw new Error('Manifest.items must be an array')

  const out: ManifestItem[] = []
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue
    const it = raw as Record<string, unknown>
    const id = typeof it.id === 'string' ? it.id : ''
    const type = it.type
    const name = typeof it.name === 'string' ? it.name : ''
    const updatedAt = typeof it.updatedAt === 'string' ? it.updatedAt : ''
    const parentId =
      it.parentId === null || typeof it.parentId === 'string' ? it.parentId : undefined
    if (!id || (type !== 'folder' && type !== 'notebook') || parentId === undefined) continue
    if (!name.trim()) continue
    out.push({
      id,
      type,
      parentId,
      name: name.trim(),
      updatedAt: updatedAt || new Date(0).toISOString(),
    })
  }
  return { version: 1, items: out }
}

export function siblingNameTaken(
  items: ManifestItem[],
  parentId: string | null,
  name: string,
  excludeId?: string,
): boolean {
  const n = name.trim()
  if (!n) return true
  return items.some(
    (it) =>
      it.parentId === parentId && it.id !== excludeId && it.name === n,
  )
}

/** True if `targetId` is `ancestorId` or a descendant of `ancestorId` (walk up from target). */
export function isUnderFolder(
  items: ManifestItem[],
  ancestorId: string,
  targetId: string,
): boolean {
  if (targetId === ancestorId) return true
  const byId = new Map<string, ManifestItem>(items.map((i) => [i.id, i]))
  let cur: string | null = targetId
  for (let depth = 0; depth < 10000; depth++) {
    const node: ManifestItem | undefined = cur ? byId.get(cur) : undefined
    if (!node) return false
    if (node.parentId === ancestorId) return true
    cur = node.parentId
    if (cur === null) return false
  }
  return false
}

/** Collect folder id and all descendant item ids (recursive). */
export function collectSubtreeIds(items: ManifestItem[], rootId: string): Set<string> {
  const result = new Set<string>()
  function add(id: string) {
    result.add(id)
    for (const it of items) {
      if (it.parentId === id) add(it.id)
    }
  }
  add(rootId)
  return result
}

export interface TreeRow {
  item: ManifestItem
  depth: number
}

/** Depth-first tree order; folders before their children; siblings sorted by name. */
/** Folder destinations allowed when moving `movingId` (exclude self and subtree for folders). */
export function listMoveTargets(
  items: ManifestItem[],
  movingId: string,
): { id: string | null; label: string }[] {
  const moving = items.find((i) => i.id === movingId)
  const blocked = new Set<string>()
  if (moving?.type === 'folder') {
    for (const id of collectSubtreeIds(items, movingId)) blocked.add(id)
  } else {
    blocked.add(movingId)
  }
  const opts: { id: string | null; label: string }[] = [{ id: null, label: '/ (root)' }]
  for (const f of items) {
    if (f.type !== 'folder' || blocked.has(f.id)) continue
    opts.push({ id: f.id, label: f.name })
  }
  opts.sort((a, b) => {
    if (a.id === null) return -1
    if (b.id === null) return 1
    return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  })
  return opts
}

export function buildTreeRows(items: ManifestItem[]): TreeRow[] {
  const byParent = new Map<string | null, ManifestItem[]>()
  for (const it of items) {
    const pid = it.parentId
    if (!byParent.has(pid)) byParent.set(pid, [])
    byParent.get(pid)!.push(it)
  }
  for (const [, arr] of byParent) {
    arr.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
  }
  const rows: TreeRow[] = []
  function walk(parentId: string | null, depth: number) {
    for (const it of byParent.get(parentId) ?? []) {
      rows.push({ item: it, depth })
      if (it.type === 'folder') walk(it.id, depth + 1)
    }
  }
  walk(null, 0)
  return rows
}
