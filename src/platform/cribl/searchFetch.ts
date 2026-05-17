import { describeFetchError } from '@platform/cribl/fetchFailure'

/** Per-page row count for `/results` (smaller pages survive ~30s platform proxy limits on wide rows). */
export const CRIBL_SEARCH_RESULTS_PAGE_SIZE = 1000

export const SEARCH_STATUS_FETCH_TIMEOUT_MS = 30_000
/** Large NDJSON pages can be slow; retries use this budget per attempt. */
export const SEARCH_RESULTS_FETCH_TIMEOUT_MS = 120_000

const DEFAULT_RESULTS_RETRIES = 3
const RETRY_BASE_MS = 400

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export function isRetriableSearchFetchError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError' || err.name === 'TimeoutError') return true
    const msg = err.message
    if (/aborted/i.test(msg) || /timeout/i.test(msg)) return true
  }
  return false
}

export function isRetriableSearchHttpStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504
}

export async function fetchSearchOnce(
  url: string,
  init: RequestInit | undefined,
  operation: string,
  timeoutMs: number,
): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (e) {
    throw new Error(describeFetchError(e, operation))
  }
}

/**
 * Fetch with retries for transient proxy/network failures (common on large `/results` pages).
 */
export async function fetchSearchWithRetry(
  url: string,
  init: RequestInit | undefined,
  operation: string,
  timeoutMs: number,
  retries = DEFAULT_RESULTS_RETRIES,
): Promise<Response> {
  let lastErr: unknown
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetchSearchOnce(url, init, operation, timeoutMs)
      if (res.ok) return res
      if (isRetriableSearchHttpStatus(res.status) && attempt < retries - 1) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      return res
    } catch (e) {
      lastErr = e
      if (attempt < retries - 1 && isRetriableSearchFetchError(e)) {
        await sleep(RETRY_BASE_MS * 2 ** attempt)
        continue
      }
      throw e
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr))
}
