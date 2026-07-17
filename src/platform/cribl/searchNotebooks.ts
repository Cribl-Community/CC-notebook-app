/**
 * Cribl Search Notebooks via REST (`GET /search/notebooks`, `GET /search/notebooks/{id}`).
 * Uses platform fetch proxy for auth (see docs/PLATFORM.md).
 */

import { callCriblApi } from '@platform/cribl/criblApiFetch'
import { parseLenientJsonResponseBody } from '@platform/cribl/searchJobs'
import {
  normalizeCriblSearchNotebookData,
  normalizeCriblSearchNotebookList,
  type CriblSearchNotebookData,
  type CriblSearchNotebookMeta,
} from '@/domain/criblSearchNotebook'

export const DEFAULT_SEARCH_NOTEBOOK_GROUP = 'default_search'

export class CriblSearchNotebooksError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'CriblSearchNotebooksError'
    this.status = status
  }
}

function notebooksBasePath(group = DEFAULT_SEARCH_NOTEBOOK_GROUP): string {
  const g = group.trim()
  if (!g) throw new Error('Search group must be non-empty.')
  return `/m/${g}/search/notebooks`
}

function httpError(method: string, path: string, status: number, text: string): CriblSearchNotebooksError {
  const hint = text.replace(/\s+/g, ' ').trim().slice(0, 400)
  return new CriblSearchNotebooksError(
    `${method} ${path} failed (${status})${hint ? `: ${hint}` : ''}`,
    status,
  )
}

function parseJsonBody(text: string): unknown {
  return parseLenientJsonResponseBody(text)
}

function getBase(apiBase: string): () => string {
  const base = apiBase.trim().replace(/\/$/, '')
  return () => base
}

export async function listCriblSearchNotebooks(
  apiBase: string,
  group = DEFAULT_SEARCH_NOTEBOOK_GROUP,
): Promise<CriblSearchNotebookMeta[]> {
  const path = notebooksBasePath(group)
  const res = await callCriblApi(
    'GET',
    path,
    {
      headers: { Accept: 'application/json' },
      body: undefined,
      bodyIsJson: false,
    },
    getBase(apiBase),
  )
  if (!res.ok) throw httpError('GET', path, res.status, res.text)
  return normalizeCriblSearchNotebookList(parseJsonBody(res.text))
}

export async function fetchCriblSearchNotebook(
  apiBase: string,
  notebookId: string,
  group = DEFAULT_SEARCH_NOTEBOOK_GROUP,
): Promise<CriblSearchNotebookData> {
  const id = notebookId.trim()
  if (!id) throw new Error('Notebook id must be non-empty.')
  const path = `${notebooksBasePath(group)}/${encodeURIComponent(id)}`
  const res = await callCriblApi(
    'GET',
    path,
    {
      headers: { Accept: 'application/json' },
      body: undefined,
      bodyIsJson: false,
    },
    getBase(apiBase),
  )
  if (!res.ok) throw httpError('GET', path, res.status, res.text)
  return normalizeCriblSearchNotebookData(parseJsonBody(res.text))
}
