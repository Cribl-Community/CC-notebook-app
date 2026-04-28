import type { CriblApiCatalogEntry } from '@features/cribl-api/criblApiCatalogTypes'

/**
 * Leader / global REST paths documented for Cribl but missing from the published
 * [cribl-openapi-spec](https://github.com/criblio/cribl-openapi-spec) `control-plane.yml`
 * / `mgmt-plane.yml` surface (e.g. `/system/info`, `/system/settings/git-settings`).
 *
 * Merged after OpenAPI + Search overrides; entries are applied only when that `METHOD path`
 * is not already present (see `criblApiCatalog.data.ts`).
 */
export const leaderRouteAdditions: readonly CriblApiCatalogEntry[] = [
  {
    method: 'GET',
    path: '/system/info',
    summary: 'Get deployment / system information',
  },
  {
    method: 'GET',
    path: '/system/version',
    summary: 'Get product version',
  },
  {
    method: 'GET',
    path: '/system/settings/git-settings',
    summary: 'Read global git settings',
  },
  {
    method: 'GET',
    path: '/system/settings/telemetry',
    summary: 'Read global telemetry settings',
  },
  {
    method: 'GET',
    path: '/master/groups',
    summary: 'List configuration groups',
  },
  {
    method: 'GET',
    path: '/master/health',
    summary: 'Master health / readiness',
  },
]
