/**
 * Persistence port for the saved-notebook library. The default adapter backs it
 * with the pack-scoped Cribl KV store; tests substitute an in-memory adapter.
 */
import type { Manifest } from '../features/library/manifest'

export interface NotebookRepo {
  readManifest(): Promise<Manifest>
  writeManifest(manifest: Manifest): Promise<void>
  readPayload(notebookId: string): Promise<string | null>
  writePayload(notebookId: string, ipynbJson: string): Promise<void>
  deletePayload(notebookId: string): Promise<void>
}
