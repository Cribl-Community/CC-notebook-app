import {
  emptyManifest,
  filterManifestItemsByOwner,
  manifestItemOwnerUsername,
  manifestKey,
  mergeManifestForOwner,
  notebookPayloadKey,
  parseManifestJson,
  userNotebookPayloadKey,
  type Manifest,
  type ManifestItem,
  NB_KV_PREFIX,
} from '@/domain/notebookManifest'
import { resolveNotebookLibraryUsername } from '@platform/cribl/criblUser'
import { kvDelete, kvGet, kvPut } from '@platform/cribl/kvstore'

const MANIFEST_KV_KEY = manifestKey(NB_KV_PREFIX)

function stampOwnerUsername(items: ManifestItem[], username: string): ManifestItem[] {
  return items.map((it) =>
    manifestItemOwnerUsername(it) ? it : { ...it, ownerUsername: username },
  )
}

async function notebookPayloadKvKey(notebookId: string): Promise<string> {
  const username = await resolveNotebookLibraryUsername()
  return username
    ? userNotebookPayloadKey(username, notebookId)
    : notebookPayloadKey(NB_KV_PREFIX, notebookId)
}

export async function kvFetchManifest(): Promise<Manifest> {
  const raw = await kvGet(MANIFEST_KV_KEY)
  const username = await resolveNotebookLibraryUsername()
  if (!raw) return emptyManifest()
  try {
    const full = parseManifestJson(raw)
    return { version: 1, items: filterManifestItemsByOwner(full.items, username) }
  } catch {
    return emptyManifest()
  }
}

export async function kvStoreManifest(m: Manifest): Promise<void> {
  const username = await resolveNotebookLibraryUsername()
  if (!username) {
    await kvPut(MANIFEST_KV_KEY, JSON.stringify(m))
    return
  }

  const stampedItems = stampOwnerUsername(m.items, username)

  const raw = await kvGet(MANIFEST_KV_KEY)
  const full = raw ? parseManifestJson(raw) : emptyManifest()
  const merged = mergeManifestForOwner(full, stampedItems, username)
  await kvPut(MANIFEST_KV_KEY, JSON.stringify(merged))
}

export async function kvFetchNotebookPayload(notebookId: string): Promise<string | null> {
  return kvGet(await notebookPayloadKvKey(notebookId))
}

export async function kvStoreNotebookPayload(notebookId: string, ipynbJson: string): Promise<void> {
  await kvPut(await notebookPayloadKvKey(notebookId), ipynbJson)
}

export async function kvDeleteNotebookPayload(notebookId: string): Promise<void> {
  await kvDelete(await notebookPayloadKvKey(notebookId))
}
