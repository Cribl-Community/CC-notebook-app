import type { Manifest } from '@/domain/library'
import type { NotebookRepo } from '@ports/NotebookRepo'
import {
  fetchManifest,
  fetchNotebookPayload,
  storeManifest,
  storeNotebookPayload,
} from '@features/library/notebookLibrary'
import { notebookPayloadKey } from '@features/library/manifest'
import { kvDelete } from '@platform/cribl/kvstore'

function mapManifestToDomain(manifest: Awaited<ReturnType<typeof fetchManifest>>): Manifest {
  return {
    version: manifest.version,
    items: manifest.items,
  }
}

export const kvNotebookRepo: NotebookRepo = {
  async readManifest() {
    const manifest = await fetchManifest()
    return mapManifestToDomain(manifest)
  },
  writeManifest(manifest) {
    return storeManifest(manifest)
  },
  readPayload(notebookId) {
    return fetchNotebookPayload(notebookId)
  },
  writePayload(notebookId, ipynbJson) {
    return storeNotebookPayload(notebookId, ipynbJson)
  },
  deletePayload(notebookId) {
    return kvDelete(notebookPayloadKey(notebookId))
  },
}
