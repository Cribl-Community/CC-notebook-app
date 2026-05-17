import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  fetchSearchWithRetry,
  isRetriableSearchFetchError,
  isRetriableSearchHttpStatus,
} from '@platform/cribl/searchFetch'

describe('isRetriableSearchFetchError', () => {
  it('treats AbortError as retriable', () => {
    expect(isRetriableSearchFetchError(Object.assign(new Error('Aborted'), { name: 'AbortError' }))).toBe(
      true,
    )
  })
})

describe('isRetriableSearchHttpStatus', () => {
  it('includes 502/503/504/429', () => {
    expect(isRetriableSearchHttpStatus(502)).toBe(true)
    expect(isRetriableSearchHttpStatus(400)).toBe(false)
  })
})

describe('fetchSearchWithRetry', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('retries on AbortError then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const res = await fetchSearchWithRetry('https://example.com/r', undefined, 'test', 5000, 3)
    expect(res.status).toBe(200)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
