export type ManifestItem =
  | {
      id: string
      type: 'folder'
      parentId: string | null
      name: string
      updatedAt: string
    }
  | {
      id: string
      type: 'notebook'
      parentId: string | null
      name: string
      updatedAt: string
    }

export interface Manifest {
  version: 1
  items: ManifestItem[]
}
