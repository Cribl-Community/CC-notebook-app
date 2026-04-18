import { kvDelete, kvGet, kvPut } from '../cribl/kvstore'
import { parseIpynbJson, serializeNotebookToIpynbJson } from './ipynb'
import type { Cell, NotebookState } from './types'
import {
  MANIFEST_KEY,
  collectSubtreeIds,
  emptyManifest,
  isUnderFolder,
  notebookPayloadKey,
  parseManifestJson,
  siblingNameTaken,
  type Manifest,
  type ManifestItem,
} from './manifest'

export type { Manifest, ManifestItem }

export async function fetchManifest(): Promise<Manifest> {
  const raw = await kvGet(MANIFEST_KEY)
  if (!raw) return emptyManifest()
  try {
    return parseManifestJson(raw)
  } catch {
    return emptyManifest()
  }
}

export async function storeManifest(m: Manifest): Promise<void> {
  await kvPut(MANIFEST_KEY, JSON.stringify(m))
}

export async function fetchNotebookPayload(notebookId: string): Promise<string | null> {
  return kvGet(notebookPayloadKey(notebookId))
}

export async function storeNotebookPayload(notebookId: string, ipynbJson: string): Promise<void> {
  await kvPut(notebookPayloadKey(notebookId), ipynbJson)
}

export function stateToIpynbJson(state: NotebookState): string {
  return serializeNotebookToIpynbJson(state)
}

export function ipynbTextToLoadPayload(text: string): { title: string; cells: Cell[] } {
  return parseIpynbJson(text)
}

/** Create a new folder under parent (default root). */
export function manifestAddFolder(
  manifest: Manifest,
  name: string,
  parentId: string | null = null,
): { manifest: Manifest; id: string } | { error: string } {
  const n = name.trim()
  if (!n) return { error: 'Folder name is required' }
  if (siblingNameTaken(manifest.items, parentId, n)) {
    return { error: 'A file or folder with that name already exists here' }
  }
  if (parentId !== null && !manifest.items.some((i) => i.id === parentId && i.type === 'folder')) {
    return { error: 'Parent folder not found' }
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const item: ManifestItem = { id, type: 'folder', parentId, name: n, updatedAt: now }
  return { manifest: { ...manifest, items: [...manifest.items, item] }, id }
}

/** Register a new notebook entry and return its id (payload written separately). */
export function manifestRegisterNotebook(
  manifest: Manifest,
  name: string,
  parentId: string | null = null,
): { manifest: Manifest; id: string } | { error: string } {
  const n = name.trim()
  if (!n) return { error: 'Notebook name is required' }
  if (siblingNameTaken(manifest.items, parentId, n)) {
    return { error: 'A file or folder with that name already exists here' }
  }
  if (parentId !== null && !manifest.items.some((i) => i.id === parentId && i.type === 'folder')) {
    return { error: 'Parent folder not found' }
  }
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const item: ManifestItem = {
    id,
    type: 'notebook',
    parentId,
    name: n,
    updatedAt: now,
  }
  return { manifest: { ...manifest, items: [...manifest.items, item] }, id }
}

export function manifestRename(
  manifest: Manifest,
  itemId: string,
  newName: string,
): { manifest: Manifest } | { error: string } {
  const n = newName.trim()
  if (!n) return { error: 'Name is required' }
  const target = manifest.items.find((i) => i.id === itemId)
  if (!target) return { error: 'Item not found' }
  if (siblingNameTaken(manifest.items, target.parentId, n, itemId)) {
    return { error: 'A file or folder with that name already exists here' }
  }
  const now = new Date().toISOString()
  const items = manifest.items.map((i) =>
    i.id === itemId ? { ...i, name: n, updatedAt: now } : i,
  )
  return { manifest: { ...manifest, items } }
}

export function manifestMove(
  manifest: Manifest,
  itemId: string,
  newParentId: string | null,
): { manifest: Manifest } | { error: string } {
  const target = manifest.items.find((i) => i.id === itemId)
  if (!target) return { error: 'Item not found' }
  if (newParentId !== null) {
    const parent = manifest.items.find((i) => i.id === newParentId && i.type === 'folder')
    if (!parent) return { error: 'Destination folder not found' }
  }
  if (target.type === 'folder' && newParentId !== null) {
    if (newParentId === itemId) return { error: 'Cannot move a folder into itself' }
    if (isUnderFolder(manifest.items, itemId, newParentId)) {
      return { error: 'Cannot move a folder into its own subfolder' }
    }
  }
  if (siblingNameTaken(manifest.items, newParentId, target.name, itemId)) {
    return { error: 'A file or folder with that name already exists here' }
  }
  const now = new Date().toISOString()
  const items = manifest.items.map((i) =>
    i.id === itemId ? { ...i, parentId: newParentId, updatedAt: now } : i,
  )
  return { manifest: { ...manifest, items } }
}

/** Remove item(s); for folders, removes subtree. Returns notebook ids whose KV payloads must be deleted. */
export function manifestRemove(
  manifest: Manifest,
  itemId: string,
): { manifest: Manifest; notebookIdsToDelete: string[] } | { error: string } {
  const target = manifest.items.find((i) => i.id === itemId)
  if (!target) return { error: 'Item not found' }

  let removeIds: Set<string>
  if (target.type === 'folder') {
    removeIds = collectSubtreeIds(manifest.items, itemId)
  } else {
    removeIds = new Set([itemId])
  }

  const notebookIdsToDelete = manifest.items
    .filter((i) => i.type === 'notebook' && removeIds.has(i.id))
    .map((i) => i.id)

  const items = manifest.items.filter((i) => !removeIds.has(i.id))
  return { manifest: { ...manifest, items }, notebookIdsToDelete }
}

/** Update notebook entry timestamp after save. */
export function manifestTouchNotebook(manifest: Manifest, notebookId: string): Manifest {
  const now = new Date().toISOString()
  const items = manifest.items.map((i) =>
    i.id === notebookId && i.type === 'notebook' ? { ...i, updatedAt: now } : i,
  )
  return { ...manifest, items }
}

/** Full save: PUT payload then manifest with updated time. */
export async function saveNotebookState(
  manifest: Manifest,
  notebookId: string,
  state: NotebookState,
): Promise<Manifest> {
  const json = stateToIpynbJson(state)
  await storeNotebookPayload(notebookId, json)
  const touched = manifestTouchNotebook(manifest, notebookId)
  await storeManifest(touched)
  return touched
}

/** Create new notebook: manifest entry + payload. */
export async function createNotebookWithPayload(
  manifest: Manifest,
  parentId: string | null,
  state: NotebookState,
): Promise<{ manifest: Manifest; id: string } | { error: string }> {
  const title = state.title.trim() || 'Untitled'
  const reg = manifestRegisterNotebook(manifest, title, parentId)
  if ('error' in reg) return reg
  const json = stateToIpynbJson({ ...state, title })
  await storeNotebookPayload(reg.id, json)
  await storeManifest(reg.manifest)
  return { manifest: reg.manifest, id: reg.id }
}

/** Delete KV payloads for notebook ids. */
export async function deleteNotebookPayloads(ids: string[]): Promise<void> {
  await Promise.all(ids.map((id) => kvDelete(notebookPayloadKey(id))))
}

/** Rename in manifest and sync `metadata.title` in stored .ipynb for notebooks. */
export async function renameEntryInKv(
  manifest: Manifest,
  itemId: string,
  newName: string,
): Promise<{ manifest: Manifest } | { error: string }> {
  const r = manifestRename(manifest, itemId, newName)
  if ('error' in r) return r
  const item = r.manifest.items.find((i) => i.id === itemId)
  if (item?.type === 'notebook') {
    const raw = await fetchNotebookPayload(itemId)
    if (raw) {
      try {
        const doc = JSON.parse(raw) as Record<string, unknown>
        const md = doc.metadata
        const meta =
          md && typeof md === 'object' ? (md as Record<string, unknown>) : {}
        meta.title = item.name
        doc.metadata = meta
        await storeNotebookPayload(itemId, JSON.stringify(doc))
      } catch {
        /* keep existing payload if invalid */
      }
    }
  }
  await storeManifest(r.manifest)
  return { manifest: r.manifest }
}
