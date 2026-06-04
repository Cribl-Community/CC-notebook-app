import {
  emptyManifest,
  manifestKey,
  notebookPayloadKey,
  parseManifestJson,
  type Manifest,
} from '@/domain/notebookManifest'
import { resolveNotebookLibraryKvRoot } from '@platform/cribl/criblUser'
import { kvDelete, kvGet, kvPut } from '@platform/cribl/kvstore'

export async function kvFetchManifest(): Promise<Manifest> {
  const root = await resolveNotebookLibraryKvRoot()
  const raw = await kvGet(manifestKey(root))
  if (!raw) return emptyManifest()
  try {
    return parseManifestJson(raw)
  } catch {
    return emptyManifest()
  }
}

export async function kvStoreManifest(m: Manifest): Promise<void> {
  const root = await resolveNotebookLibraryKvRoot()
  await kvPut(manifestKey(root), JSON.stringify(m))
}

export async function kvFetchNotebookPayload(notebookId: string): Promise<string | null> {
  const root = await resolveNotebookLibraryKvRoot()
  return kvGet(notebookPayloadKey(root, notebookId))
}

export async function kvStoreNotebookPayload(notebookId: string, ipynbJson: string): Promise<void> {
  const root = await resolveNotebookLibraryKvRoot()
  await kvPut(notebookPayloadKey(root, notebookId), ipynbJson)
}

export async function kvDeleteNotebookPayload(notebookId: string): Promise<void> {
  const root = await resolveNotebookLibraryKvRoot()
  await kvDelete(notebookPayloadKey(root, notebookId))
}
