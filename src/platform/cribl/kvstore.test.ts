import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { kvGet, kvPut } from '@platform/cribl/kvstore'

describe('kvstore URL encoding', () => {
  const prevUrl = window.CRIBL_API_URL

  beforeEach(() => {
    window.CRIBL_API_URL = 'https://cribl.example/api/v1'
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (prevUrl !== undefined) window.CRIBL_API_URL = prevUrl
    else delete window.CRIBL_API_URL
  })

  it('kvPut encodes notebook payload key once', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    await kvPut('nb/v1/notebooks/Michael_Hyatt_715f4894-5213-4a7d-a5b2-dce67cd010bf', '{}')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://cribl.example/api/v1/kvstore/nb/v1/notebooks/Michael_Hyatt_715f4894-5213-4a7d-a5b2-dce67cd010bf',
      expect.objectContaining({ method: 'PUT' }),
    )
  })

  it('kvGet encodes manifest key once', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404 })
    vi.stubGlobal('fetch', fetchMock)

    await kvGet('nb/v1/manifest')

    expect(fetchMock).toHaveBeenCalledWith('https://cribl.example/api/v1/kvstore/nb/v1/manifest')
  })
})
