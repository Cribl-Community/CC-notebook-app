export type SearchProgressEvent = {
  fraction: number
  label: string
}

export type SearchJobResult = {
  rows: Record<string, unknown>[]
  columns: string[]
  totalRecords: number | null
}
