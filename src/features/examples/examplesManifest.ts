export function exampleNotebookDisplayLabel(filename: string): string {
  return filename.replace(/\.ipynb$/i, '').replace(/_/g, ' ')
}

export type ExampleLevel = 'beginner' | 'intermediate' | 'advanced'

export type ExampleNotebook = {
  filename: string
  title: string
  summary: string
  tags: string[]
  level: ExampleLevel
  estimatedRuntime: string
  recommendedOrder: number
}

export type ExamplesManifestV1 = {
  version: 1
  notebooks: string[]
}

export type ExampleNotebookDescriptor = {
  filename: string
  title?: string
  summary?: string
  tags?: string[]
  level?: ExampleLevel
  estimatedRuntime?: string
  recommendedOrder?: number
}

export type ExamplesManifestV2 = {
  version: 2
  notebooks: ExampleNotebookDescriptor[]
}

function defaultNotebook(filename: string): ExampleNotebook {
  return {
    filename,
    title: exampleNotebookDisplayLabel(filename),
    summary: 'Bundled example notebook.',
    tags: [],
    level: 'beginner',
    estimatedRuntime: '5-10 min',
    recommendedOrder: 999,
  }
}

function parseV1Notebooks(notebooks: unknown[]): ExampleNotebook[] | null {
  if (!notebooks.every((x): x is string => typeof x === 'string')) return null
  return notebooks.map((filename, idx) => ({ ...defaultNotebook(filename), recommendedOrder: idx + 1 }))
}

function parseV2Notebooks(notebooks: unknown[]): ExampleNotebook[] | null {
  const out: ExampleNotebook[] = []
  for (const entry of notebooks) {
    if (!entry || typeof entry !== 'object') return null
    const raw = entry as Record<string, unknown>
    if (typeof raw.filename !== 'string') return null
    const base = defaultNotebook(raw.filename)
    const title = typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : base.title
    const summary = typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : base.summary
    const tags =
      Array.isArray(raw.tags) && raw.tags.every((x): x is string => typeof x === 'string')
        ? raw.tags
        : base.tags
    const level = raw.level === 'beginner' || raw.level === 'intermediate' || raw.level === 'advanced'
      ? raw.level
      : base.level
    const estimatedRuntime =
      typeof raw.estimatedRuntime === 'string' && raw.estimatedRuntime.trim()
        ? raw.estimatedRuntime.trim()
        : base.estimatedRuntime
    const recommendedOrder =
      typeof raw.recommendedOrder === 'number' && Number.isFinite(raw.recommendedOrder)
        ? raw.recommendedOrder
        : base.recommendedOrder
    out.push({
      filename: raw.filename,
      title,
      summary,
      tags,
      level,
      estimatedRuntime,
      recommendedOrder,
    })
  }
  return out
}

export function parseExamplesManifest(data: unknown): ExampleNotebook[] | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const nb = o.notebooks
  if (!Array.isArray(nb)) return null
  if (o.version === 1) return parseV1Notebooks(nb)
  if (o.version === 2) return parseV2Notebooks(nb)
  return null
}
