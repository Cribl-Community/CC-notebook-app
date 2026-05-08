import type { Manifest } from '@/domain/library'
import type { NotebookRepo } from '@ports/NotebookRepo'
import {
  kvDeleteNotebookPayload,
  kvFetchManifest,
  kvFetchNotebookPayload,
  kvStoreManifest,
  kvStoreNotebookPayload,
} from './notebookKv'

export const kvNotebookRepo: NotebookRepo = {
  readManifest() {
    return kvFetchManifest()
  },
  writeManifest(manifest: Manifest) {
    return kvStoreManifest(manifest)
  },
  readPayload(notebookId) {
    return kvFetchNotebookPayload(notebookId)
  },
  writePayload(notebookId, ipynbJson) {
    return kvStoreNotebookPayload(notebookId, ipynbJson)
  },
  deletePayload(notebookId) {
    return kvDeleteNotebookPayload(notebookId)
  },
}
