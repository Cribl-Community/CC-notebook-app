import { criblApiCatalogData } from './criblApiCatalog.data'
import type { CriblApiCatalogEntry } from './criblApiCatalogTypes'

const segs = (p: string) => p.split('/').filter(Boolean)

/** Typed segment `ti` vs catalog segment `pi` (lowercase): prefix match without treating `/m` as a prefix of `master` / `metrics`. */
function segmentMatchesTypedPrefix(piLower: string, tiLower: string): boolean {
  if (piLower.startsWith('{') && piLower.endsWith('}') && piLower.length > 2) return true
  if (!tiLower.length) return true
  if (!piLower.startsWith(tiLower)) return false
  if (tiLower === 'm' && piLower !== 'm') {
    if (piLower.startsWith('master') || piLower.startsWith('metrics')) return false
  }
  return true
}

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
    const pl = pi.toLowerCase()
    const tii = ti.toLowerCase()
    if (!segmentMatchesTypedPrefix(pl, tii)) return false
  }
  return tPart.length <= pPart.length
}

/** Order Tab completions so common `/m/...` routes surface above long alphabetical tails. */
function criblApiPathCompletionSortKey(path: string): number {
  if (path.startsWith('/m/default_search')) return 0
  if (path.includes('/m/{groupId}/pipelines')) return 1
  if (path.includes('/m/{groupId}/routes')) return 2
  if (path.includes('/m/{groupId}/system/inputs')) return 3
  if (path.includes('/m/{groupId}/system/outputs')) return 4
  if (path.startsWith('/m/{groupId}/system/')) return 5
  if (path.startsWith('/m/{groupId}/cribl/')) return 6
  return 7
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
  }
  const boostM = norm === '/m' || norm.startsWith('/m/')
  out.sort((a, b) => {
    if (boostM) {
      const ka = criblApiPathCompletionSortKey(a.path)
      const kb = criblApiPathCompletionSortKey(b.path)
      if (ka !== kb) return ka - kb
    }
    return a.path.localeCompare(b.path, undefined, { sensitivity: 'base' })
  })
  return out.slice(0, limit)
}
