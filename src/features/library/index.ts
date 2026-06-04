/**
 * Public surface for the saved-notebook library slice.
 * Other features should import from `@features/library` instead of deep paths.
 */
export { NotebookSidebar } from './ui/NotebookSidebar'
export {
  useNotebookLibrary,
  type NotebookLibraryController,
  type MoveDestination,
} from './hooks/useNotebookLibrary'
export type { Manifest, ManifestItem } from './manifest'
export {
  createNotebookWithPayload,
  deleteNotebookPayloads,
  fetchNotebookPayload,
  ipynbTextToLoadPayload,
  manifestAddFolder,
  manifestMove,
  manifestRemove,
  manifestSetNotebookTags,
  renameEntryInKv,
  saveNotebookState,
  storeManifest,
} from './notebookLibrary'
