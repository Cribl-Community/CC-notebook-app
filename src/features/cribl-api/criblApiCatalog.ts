import { criblApiCatalogData } from './criblApiCatalog.data'
import type { CriblApiCatalogEntry } from './criblApiCatalogTypes'

const segs = (p: string) => p.split('/').filter(Boolean)

/**
 * True if `concrete` matches a pattern with `{param}` single-segment placeholders.
 */
export function pathMatchesTemplate(concrete: string, template: string): boolean {
  if (concrete === template) return true
  const a = segs(concrete)
  const b = segs(template)
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const part = b[i]!
    if (part.startsWith('{') && part.endsWith('}') && part.length > 2) continue
    if (a[i] !== part) return false
  }
  return true
}

export function findCriblApiCatalogEntry(method: string, path: string): CriblApiCatalogEntry | undefined {
  const m = method.toUpperCase()
  for (const op of criblApiCatalogData.operations) {
    if (op.method !== m) continue
    if (op.path === path) return op
  }
  for (const op of criblApiCatalogData.operations) {
    if (op.method !== m) continue
    if (pathMatchesTemplate(path, op.path)) return op
  }
  return undefined
}

/**
 * Whether the typed path prefix (segment-wise) is consistent with a catalog `opPath`.
 * Empty or `/` matches all; for each typed segment, the op segment is the same prefix, or `{p}`.
 */
export function opPathMatchesTypedPrefix(typed: string, opPath: string): boolean {
  const tr = (typed || '').trim()
  const norm = tr.startsWith('/') || tr === '' ? (tr || '/') : `/${tr}`
  if (norm === '/' && (!tr || tr === '/')) return true
  const tPart = segs(norm)
  if (tPart.length === 0) return true
  const pPart = segs(opPath)
  for (let i = 0; i < tPart.length; i++) {
    if (i >= pPart.length) return false
    const ti = tPart[i]!
    const pi = pPart[i]!
    if (pi.startsWith('{') && pi.endsWith('}') && pi.length > 2) continue
    const pl = pi.toLowerCase()
    const tii = ti.toLowerCase()
    if (tii.length > 0 && !pl.startsWith(tii)) return false
  }
  return tPart.length <= pPart.length
}

export function listCriblApiPathCompletions(
  method: string,
  pathPrefix: string,
  limit: number = 80,
): CriblApiCatalogEntry[] {
  const m = method.toUpperCase()
  const t = pathPrefix.trim() || '/'
  const norm = t.startsWith('/') ? t : `/${t}`
  const { operations } = criblApiCatalogData
  const out: CriblApiCatalogEntry[] = []
  for (const op of operations) {
    if (op.method !== m) continue
    if (opPathMatchesTypedPrefix(norm, op.path)) out.push(op)
    if (out.length >= limit) break
  }
  return out
}
