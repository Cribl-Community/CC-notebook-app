import type { CriblApiCatalogFile, CriblApiCatalogEntry } from '@features/cribl-api/criblApiCatalogTypes'
import { leaderRouteAdditions } from '@features/cribl-api/criblApiLeaderCatalogOverrides.data'
import { searchContextRouteAdditions } from '@features/cribl-api/criblApiSearchContextOverrides.data'
import openApi from '@features/cribl-api/generated/criblApiOpenApiIndex.json'

const opKey = (o: CriblApiCatalogEntry) => `${o.method} ${o.path}`

const LEADER_GROUP_TAIL =
  'From the leader API base (`CRIBL_API_URL`), use your worker group id instead of `{groupId}`. List groups with `GET /master/groups`.'

/** Leader-facing path: `/m/{groupId}` + OpenAPI worker-host path (see `shouldMirrorOpenApiPathForLeaderGroup`). */
function leaderGroupContextPath(path: string): string {
  return `/m/{groupId}${path}`
}

/**
 * Published OpenAPI lists many routes at the repo root (`/pipelines`, `/routes`, `/system/…`) for worker
 * host base URLs. On the leader `CRIBL_API_URL`, the same resources use `/m/{groupId}/…`.
 */
function shouldMirrorOpenApiPathForLeaderGroup(path: string): boolean {
  if (path.startsWith('/system/')) return !path.startsWith('/system/settings/')
  if (path === '/pipelines' || path.startsWith('/pipelines/')) return true
  if (path === '/routes' || path.startsWith('/routes/')) return true
  return false
}

const merged = new Map<string, CriblApiCatalogEntry>()
const openOps = (openApi as { operations: CriblApiCatalogEntry[] }).operations
for (const o of openOps) {
  merged.set(opKey(o), o)
}
for (const o of openOps) {
  if (!shouldMirrorOpenApiPathForLeaderGroup(o.path)) continue
  const path = leaderGroupContextPath(o.path)
  const entry: CriblApiCatalogEntry = {
    ...o,
    path,
    description: o.description ? `${o.description}\n\n${LEADER_GROUP_TAIL}` : LEADER_GROUP_TAIL,
  }
  const k = opKey(entry)
  if (!merged.has(k)) merged.set(k, entry)
}
for (const o of searchContextRouteAdditions) {
  merged.set(opKey(o), o)
}
for (const o of leaderRouteAdditions) {
  const k = opKey(o)
  if (!merged.has(k)) {
    merged.set(k, o)
  }
}
const operations = [...merged.values()].sort(
  (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
)

/**
 * Merged Cribl REST index: [cribl-openapi-spec](https://github.com/criblio/cribl-openapi-spec)
 * via `npm run update:cribl-api` (default: **latest** = `control-plane-dev` + `mgmt-plane-prerelease` on `main`), or
 * `npm run update:cribl-api:release` for stable `control-plane` + `mgmt-plane`. See `scripts/cribl-openapi-to-catalog.mjs`.
 * Also: Search-context routes, leader routes missing from the published spec, and `/m/{groupId}/…` mirrors
 * for worker-group resources OpenAPI documents at `/system/…`, `/pipelines`, `/routes`, etc. (worker host context).
 */
export const criblApiCatalogData: CriblApiCatalogFile = { version: 1, operations }
