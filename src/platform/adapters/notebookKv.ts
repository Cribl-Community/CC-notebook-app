import {
  emptyManifest,
  MANIFEST_KEY,
  notebookPayloadKey,
  parseManifestJson,
  type Manifest,
} from '@/domain/notebookManifest'
import { kvDelete, kvGet, kvPut } from '@platform/cribl/kvstore'

export async function kvFetchManifest(): Promise<Manifest> {
  const raw = await kvGet(MANIFEST_KEY)
  if (!raw) return emptyManifest()
  try {
    return parseManifestJson(raw)
  } catch {
    return emptyManifest()
  }
}

export async function kvStoreManifest(m: Manifest): Promise<void> {
  await kvPut(MANIFEST_KEY, JSON.stringify(m))
}

export async function kvFetchNotebookPayload(notebookId: string): Promise<string | null> {
  return kvGet(notebookPayloadKey(notebookId))
}

export async function kvStoreNotebookPayload(notebookId: string, ipynbJson: string): Promise<void> {
  await kvPut(notebookPayloadKey(notebookId), ipynbJson)
}

export async function kvDeleteNotebookPayload(notebookId: string): Promise<void> {
  await kvDelete(notebookPayloadKey(notebookId))
}
