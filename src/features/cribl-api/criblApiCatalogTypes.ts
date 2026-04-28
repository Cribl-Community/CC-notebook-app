export type CriblApiCatalogEntry = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  summary: string
  description?: string
  /** Suggested `json` body (object or array root); serialized to YAML under the `json:` key. */
  jsonBody?: unknown
}

export type CriblApiCatalogFile = {
  version: number
  operations: CriblApiCatalogEntry[]
}
