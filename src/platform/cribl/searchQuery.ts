/** Prepends the `cribl` operator when missing (Search API expects it). */
export function normalizeSearchQuery(query: string): string {
  const q = query.trim()
  if (!q) return q
  if (/^cribl\b/i.test(q)) return q
  return `cribl ${q}`
}
