export type ManifestItem =
  | {
      id: string
      type: 'folder'
      parentId: string | null
      name: string
      updatedAt: string
      /** When set, item belongs to this `getCriblUser().username` (shared manifest). */
      ownerUsername?: string
    }
  | {
      id: string
      type: 'notebook'
      parentId: string | null
      name: string
      updatedAt: string
      /** Library-only labels for sidebar filtering (comma-edited in UI). */
      tags: string[]
      /** When set, item belongs to this `getCriblUser().username` (shared manifest). */
      ownerUsername?: string
    }

export interface Manifest {
  version: 1
  items: ManifestItem[]
}
