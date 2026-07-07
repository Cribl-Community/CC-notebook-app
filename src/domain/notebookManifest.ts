/** KV key prefix for this app’s notebook library (legacy pack-wide root). */
import type { Manifest, ManifestItem } from '@/domain/library'

export const NB_KV_PREFIX = 'nb/v1'

function normalizeLibraryRoot(root: string): string {
  return root
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .join('/')
}

/** Full KV key for the manifest JSON at a given library root (e.g. {@link NB_KV_PREFIX} or a user-scoped root). */
export function manifestKey(libraryRoot: string): string {
  return `${normalizeLibraryRoot(libraryRoot)}/manifest`
}

/** Full KV key for a notebook `.ipynb` payload at a given library root. */
export function notebookPayloadKey(libraryRoot: string, notebookId: string): string {
  return `${normalizeLibraryRoot(libraryRoot)}/notebooks/${notebookId}`
}

/**
 * URL-safe username prefix for notebook KV ids (`nb/v1/notebooks/{token}_{notebookId}`).
 * Cribl Cloud only routes `nb/v1/notebooks/*` when the id segment has no spaces or `::`.
 */
export function usernameStorageToken(username: string): string {
  const trimmed = username.trim()
  if (!trimmed) return ''
  const token = trimmed
    .replace(/\s+/g, '_')
    .replace(/\//g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  return token || 'user'
}

/**
 * Per-user notebook payload at `nb/v1/notebooks/{usernameToken}_{notebookId}`.
 * Manifest notebook `id` stays a UUID; only the KV key embeds the owner.
 */
export function userNotebookPayloadKey(username: string, notebookId: string): string {
  const token = usernameStorageToken(username)
  return `${NB_KV_PREFIX}/notebooks/${token}_${notebookId}`
}

/** Read `ownerUsername` from a manifest item when present. */
export function manifestItemOwnerUsername(item: ManifestItem): string | undefined {
  const raw = (item as { ownerUsername?: unknown }).ownerUsername
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/**
 * When `username` is set, keep only items owned by that user (legacy items without
 * `ownerUsername` are hidden). When `username` is null, return all items.
 */
export function filterManifestItemsByOwner(
  items: ManifestItem[],
  username: string | null,
): ManifestItem[] {
  if (!username) return items
  return items.filter((it) => manifestItemOwnerUsername(it) === username)
}

/**
 * Replace one user's items in a shared manifest while preserving other owners.
 */
export function mergeManifestForOwner(
  full: Manifest,
  ownerItems: ManifestItem[],
  username: string,
): Manifest {
  const others = full.items.filter((it) => manifestItemOwnerUsername(it) !== username)
  return { version: 1, items: [...others, ...ownerItems] }
}

function parseOwnerUsernameField(raw: unknown): string | undefined {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** Pack-wide manifest key; same as {@link manifestKey}({@link NB_KV_PREFIX}). */
export const MANIFEST_KEY = manifestKey(NB_KV_PREFIX)

export type { Manifest, ManifestItem }

export function emptyManifest(): Manifest {
  return { version: 1, items: [] }
}

/** Trim, drop empties, dedupe first occurrence (case-sensitive). */
export function normalizeManifestTagList(tags: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of tags) {
    const t = typeof x === 'string' ? x.trim() : ''
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

function parseManifestTagsField(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const strings = raw.filter((x): x is string => typeof x === 'string')
  return normalizeManifestTagList(strings)
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
    const trimmedName = name.trim()
    const ts = updatedAt || new Date(0).toISOString()
    const ownerUsername = parseOwnerUsernameField(it.ownerUsername)
    if (type === 'folder') {
      out.push({
        id,
        type: 'folder',
        parentId,
        name: trimmedName,
        updatedAt: ts,
        ...(ownerUsername ? { ownerUsername } : {}),
      })
    } else {
      out.push({
        id,
        type: 'notebook',
        parentId,
        name: trimmedName,
        updatedAt: ts,
        tags: parseManifestTagsField(it.tags),
        ...(ownerUsername ? { ownerUsername } : {}),
      })
    }
  }
  return { version: 1, items: out }
}

/**
 * When `selectedTags` is non-empty, keep notebooks that have **any** of those tags
 * (OR), plus ancestor folders. Empty `selectedTags` returns `items` unchanged.
 */
export function filterManifestItemsByTagSelection(
  items: ManifestItem[],
  selectedTags: ReadonlySet<string>,
): ManifestItem[] {
  if (selectedTags.size === 0) return items
  const byId = new Map(items.map((i) => [i.id, i]))
  const matchingNotebookIds = new Set<string>()
  for (const it of items) {
    if (it.type !== 'notebook') continue
    if (it.tags.some((t) => selectedTags.has(t))) matchingNotebookIds.add(it.id)
  }
  if (matchingNotebookIds.size === 0) return []
  const keepIds = new Set<string>()
  for (const nid of matchingNotebookIds) {
    keepIds.add(nid)
    let pid: string | null | undefined = byId.get(nid)?.parentId
    while (pid) {
      keepIds.add(pid)
      const parent = byId.get(pid)
      pid = parent?.parentId ?? null
    }
  }
  return items.filter((i) => keepIds.has(i.id))
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
