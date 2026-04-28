import type { CriblApiCatalogFile, CriblApiCatalogEntry } from '@features/cribl-api/criblApiCatalogTypes'
import { leaderRouteAdditions } from '@features/cribl-api/criblApiLeaderCatalogOverrides.data'
import { searchContextRouteAdditions } from '@features/cribl-api/criblApiSearchContextOverrides.data'
import openApi from '@features/cribl-api/generated/criblApiOpenApiIndex.json'

const opKey = (o: CriblApiCatalogEntry) => `${o.method} ${o.path}`

const merged = new Map<string, CriblApiCatalogEntry>()
for (const o of (openApi as { operations: CriblApiCatalogEntry[] }).operations) {
  merged.set(opKey(o), o)
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
 * Also: Search-context routes, then leader routes missing from the published spec.
 */
export const criblApiCatalogData: CriblApiCatalogFile = { version: 1, operations }
