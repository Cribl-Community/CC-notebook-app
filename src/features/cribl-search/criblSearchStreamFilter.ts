/**
 * Suppresses Pyodide / micropip stdout/stderr noise in %%cribl_search cells
 * (package load messages are not useful next to the structured result UI).
 */

function isPyodidePackageNoiseLine(line: string): boolean {
  const t = line.trim()
  if (!t) return false
  if (/^Loading\s+/i.test(t)) return true
  if (/^Loaded\s+/i.test(t)) return true
  if (/already loaded/i.test(t)) return true
  if (/No new packages/i.test(t)) return true
  return false
}

/** Drop noisy lines; preserves newlines between kept lines. */
export function filterPyodidePackageChatter(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !isPyodidePackageNoiseLine(line))
    .join('\n')
}
