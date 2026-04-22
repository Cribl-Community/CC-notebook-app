/** Shared helpers for Cribl Search result rows (column lists, field facet counts). */

/** Sorted union of keys across rows (stable for column headers). */
export function deriveColumnNames(rows: Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      keys.add(k)
    }
  }
  return [...keys].sort((a, b) => a.localeCompare(b))
}

/**
 * For each field, count rows where the value is present (non-null, non-empty string).
 */
export function computeFieldCounts(
  rows: Record<string, unknown>[],
  columns: string[],
): [string, number][] {
  const out: [string, number][] = []
  for (const col of columns) {
    let n = 0
    for (const row of rows) {
      const v = row[col]
      if (v === null || v === undefined) continue
      if (typeof v === 'string' && v.trim() === '') continue
      n++
    }
    out.push([col, n])
  }
  out.sort((a, b) => a[0].localeCompare(b[0]))
  return out
}
