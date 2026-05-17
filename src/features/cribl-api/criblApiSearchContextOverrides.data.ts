import type { CriblApiCatalogEntry } from '@features/cribl-api/criblApiCatalogTypes'

/**
 * Cribl Search REST paths under the `default_search` (and parametric) group are not
 * in the public control-/mgmt-plane OpenAPI on GitHub. These align with
 * [Cribl as Code → API](https://docs.cribl.io/cribl-as-code/api/) and
 * `public/Examples/Cribl_API_Examples.ipynb`.
 * They are merged on top of `generated/criblApiOpenApiIndex.json` (overrides by method+path).
 */
export const searchContextRouteAdditions: readonly CriblApiCatalogEntry[] = [
  {
    method: 'GET',
    path: '/m/default_search/search/jobs',
    summary: 'List search jobs in the default_search config group',
    description:
      'Contextual search API for the `default_search` config group. Use `groupId` in other group contexts.',
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
    description: 'Submits a job using the same JSON as the Search jobs API.',
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
    path: '/m/{groupId}/search/datasets',
    summary: 'List Cribl Search datasets in a config group (contextual)',
  },
  {
    method: 'POST',
    path: '/m/{groupId}/search/datasets',
    summary: 'Create a Cribl Search dataset',
    description:
      'Registers a federated dataset (for example api_http with breakerRulesets for CSV). Use groupId `default_search` for Search.',
    jsonBody: {
      type: 'api_http',
      id: 'my_http_dataset',
      description: 'Example HTTP API dataset',
      provider: 'my_http_provider',
      enabledEndpoints: ['my_endpoint'],
      filter: 'true',
      searchVersion: 'v1',
      breakerRulesets: ['CSV Datatypes', 'Cribl Search'],
      metadata: { enableAcceleration: false },
    },
  },
  {
    method: 'DELETE',
    path: '/m/{groupId}/search/datasets/{id}',
    summary: 'Delete a Cribl Search dataset by id',
  },
  {
    method: 'GET',
    path: '/m/{groupId}/search/dataset-providers',
    summary: 'List Cribl Search dataset providers in a config group',
  },
  {
    method: 'POST',
    path: '/m/{groupId}/search/dataset-providers',
    summary: 'Create a Cribl Search dataset provider',
    description:
      'For CSV/JSON over HTTP, use type `api_http` (Generic HTTP API). See Threat_Hunting_Playbook.ipynb (NERD ip_rep.csv).',
    jsonBody: {
      type: 'api_http',
      id: 'my_http_provider',
      description: 'Generic HTTP API provider',
      authenticationMethod: 'none',
      availableEndpoints: [
        {
          name: 'my_endpoint',
          method: 'GET',
          url: 'https://example.com/data.csv',
          headers: [],
          dataField: '',
        },
      ],
    },
  },
  {
    method: 'DELETE',
    path: '/m/{groupId}/search/dataset-providers/{id}',
    summary: 'Delete a Cribl Search dataset provider by id',
  },
]
