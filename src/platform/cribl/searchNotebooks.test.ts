import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as criblApiFetch from '@platform/cribl/criblApiFetch'
import {
  CriblSearchNotebooksError,
  fetchCriblSearchNotebook,
  listCriblSearchNotebooks,
} from '@platform/cribl/searchNotebooks'

vi.mock('@platform/cribl/criblApiFetch', () => ({
  callCriblApi: vi.fn(),
}))

const API_BASE = 'https://tenant.example/api/v1'

describe('searchNotebooks', () => {
  beforeEach(() => {
    vi.mocked(criblApiFetch.callCriblApi).mockReset()
  })

  it('lists notebooks from items array', async () => {
    vi.mocked(criblApiFetch.callCriblApi).mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({
        items: [
          {
            id: 'notebook-a',
            info: { name: 'Alpha', modified: 1000 },
          },
          {
            id: 'notebook-b',
            info: { name: 'Beta' },
          },
        ],
      }),
      jsonValue: {},
    })
    const items = await listCriblSearchNotebooks(API_BASE)
    expect(items).toEqual([
      { id: 'notebook-a', name: 'Alpha', updatedAt: 1000 },
      { id: 'notebook-b', name: 'Beta' },
    ])
    expect(criblApiFetch.callCriblApi).toHaveBeenCalledWith(
      'GET',
      '/m/default_search/search/notebooks',
      expect.any(Object),
      expect.any(Function),
    )
  })

  it('fetches a single notebook with sections', async () => {
    vi.mocked(criblApiFetch.callCriblApi).mockResolvedValue({
      ok: true,
      status: 200,
      text: JSON.stringify({
        items: [
          {
            id: 'notebook-a',
            info: { name: 'Alpha' },
            sections: [
              {
                variant: 'markdown',
                config: { markdown: 'Hello' },
              },
              {
                variant: 'search',
                config: {
                  query: 'cribl | limit 1',
                  earliest: '-1h',
                  latest: 'now',
                },
                info: { title: 'Q1' },
              },
            ],
          },
        ],
      }),
      jsonValue: {},
    })
    const nb = await fetchCriblSearchNotebook(API_BASE, 'notebook-a')
    expect(nb.id).toBe('notebook-a')
    expect(nb.name).toBe('Alpha')
    expect(nb.cells).toHaveLength(2)
    expect(nb.cells[0].kind).toBe('note')
    expect(nb.cells[1].kind).toBe('search')
  })

  it('throws CriblSearchNotebooksError on HTTP failure', async () => {
    vi.mocked(criblApiFetch.callCriblApi).mockResolvedValue({
      ok: false,
      status: 403,
      text: 'Forbidden',
      jsonValue: null,
    })
    await expect(listCriblSearchNotebooks(API_BASE)).rejects.toBeInstanceOf(CriblSearchNotebooksError)
  })
})
