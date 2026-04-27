export type CriblApiCatalogEntry = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  summary: string
  description?: string
  /** Suggested `json` body for POST/PUT/PATCH; serialized to YAML under the `json:` key. */
  jsonBody?: Record<string, unknown>
}

export type CriblApiCatalogFile = {
  version: number
  operations: CriblApiCatalogEntry[]
}
