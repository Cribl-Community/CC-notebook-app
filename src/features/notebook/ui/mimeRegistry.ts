import type { ReactNode } from 'react'
import type { MimeBundle, MimeMetadata } from '@/domain/kernel'

/**
 * A registry entry knows how to render exactly one mime type. The renderer
 * selects the highest-ranked entry whose mime is present in the bundle, with
 * `text/plain` always available as a final fallback.
 */
export interface MimeRenderer {
  mime: string
  /** Higher ranks win when multiple registered mimes are present in a bundle. */
  rank: number
  render: (data: string, metadata: MimeMetadata) => ReactNode
}

const renderers: MimeRenderer[] = []
let renderersSorted = false

export function registerMimeRenderer(r: MimeRenderer): void {
  renderers.push(r)
  renderersSorted = false
}

function sortedRenderers(): MimeRenderer[] {
  if (!renderersSorted) {
    renderers.sort((a, b) => b.rank - a.rank)
    renderersSorted = true
  }
  return renderers
}

export function pickRenderer(bundle: MimeBundle): MimeRenderer | null {
  for (const r of sortedRenderers()) {
    if (Object.prototype.hasOwnProperty.call(bundle, r.mime)) return r
  }
  return null
}
