import type { CriblApiCatalogFile } from './criblApiCatalogTypes'

/**
 * Curated Cribl REST control-plane surface for %%cribl_api authoring. Paths match
 * examples in `public/Examples/Cribl_API_Examples.ipynb` and common `/m/`, `/search/`, `/system/`
 * usage (see Cribl “as code” API docs: https://docs.cribl.io/cribl-as-code/api/ ).
 * Edit this when adding or correcting well-known operations.
 */
export const criblApiCatalogData: CriblApiCatalogFile = {
  version: 1,
  operations: [
    {
      method: 'GET',
      path: '/m/default_search/search/jobs',
      summary: 'List search jobs in the default_search config group',
      description:
        'Contextual search API under the default_search group. List jobs that match the query API.',
    },
    {
      method: 'GET',
      path: '/m/default_search/search/jobs/{id}',
      summary: 'Get a search job by id',
    },
    {
      method: 'POST',
      path: '/m/default_search/search/jobs',
      summary: 'Create a new search job',
      description: 'Submits a job; uses the same JSON fields the Search jobs API expects.',
      jsonBody: {
        query: 'cribl dataset="cribl_search_sample" | limit 100',
        earliest: '-1h',
        latest: 'now',
        sampleRate: 1,
      },
    },
    {
      method: 'DELETE',
      path: '/m/default_search/search/jobs/{id}',
      summary: 'Delete a search job',
    },
    {
      method: 'GET',
      path: '/system/info',
      summary: 'Get deployment / system information',
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
      path: '/system/version',
      summary: 'Get product version',
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
    {
      method: 'GET',
      path: '/m/{groupId}/system/health',
      summary: 'Worker group system health (contextual)',
    },
    {
      method: 'GET',
      path: '/m/{groupId}/cribl/search/datasets',
      summary: 'List Cribl Search datasets (contextual, non-search groupId)',
    },
  ],
}
