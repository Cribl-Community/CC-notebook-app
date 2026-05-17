/** Prepends the `cribl` operator when missing (Search API expects it for typical `dataset=` pipelines). */
export function normalizeSearchQuery(query: string): string {
  const q = query.trim()
  if (!q) return q
  if (/^cribl\b/i.test(q)) return q
  /** `externaldata` is a standalone pipeline head; a leading `cribl` breaks these queries (see bundled Anomaly PyOD example). */
  if (/^externaldata\b/i.test(q)) return q
  return `cribl ${q}`
}

/**
 * When `%%cribl_search` sets `limit=N`, append `| limit N` so Search materializes fewer rows
 * server-side (faster jobs, smaller `/results` payloads under platform fetch timeouts).
 */
export function applySearchRowCap(query: string, maxRows: number): string {
  const q = query.trim()
  if (maxRows <= 0 || !q) return q
  if (/\|\s*limit\s+\d+/i.test(q)) return q
  return `${q}\n| limit ${maxRows}`
}
