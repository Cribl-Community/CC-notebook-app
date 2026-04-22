export type ExamplesManifestV1 = {
  version: 1
  notebooks: string[]
}

export function parseExamplesManifest(data: unknown): string[] | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (o.version !== 1) return null
  const nb = o.notebooks
  if (!Array.isArray(nb)) return null
  if (!nb.every((x): x is string => typeof x === 'string')) return null
  return nb
}

export function exampleNotebookDisplayLabel(filename: string): string {
  return filename.replace(/\.ipynb$/i, '').replace(/_/g, ' ')
}
