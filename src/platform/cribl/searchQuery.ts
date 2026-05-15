/** Prepends the `cribl` operator when missing (Search API expects it for typical `dataset=` pipelines). */
export function normalizeSearchQuery(query: string): string {
  const q = query.trim()
  if (!q) return q
  if (/^cribl\b/i.test(q)) return q
  /** `externaldata` is a standalone pipeline head; a leading `cribl` breaks these queries (see bundled Anomaly PyOD example). */
  if (/^externaldata\b/i.test(q)) return q
  return `cribl ${q}`
}
