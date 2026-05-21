const FETCH_ERROR_PATTERNS: RegExp[] = [
  /failed to fetch/i,
  /networkerror/i,
  /load failed/i,
  /network request failed/i,
  /fetch failed/i,
  /cors/i,
]

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

export function isCorsOrNetworkFetchError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'AbortError') return false
  if (err instanceof TypeError) return true
  const msg = errorMessage(err).trim()
  if (!msg) return false
  return FETCH_ERROR_PATTERNS.some((rx) => rx.test(msg))
}

export function describeFetchError(err: unknown, operation?: string): string {
  const raw = errorMessage(err).trim() || 'Unknown error.'
  if (!isCorsOrNetworkFetchError(err)) return raw
  /** Avoid stacking “X failed immediately…” when an inner layer already formatted the message. */
  if (/failed immediately\./i.test(raw)) return raw
  const prefix = operation ? `${operation} failed immediately.` : 'Request failed immediately.'
  return `${prefix} This is usually a browser network/CORS failure and is not retried. ${raw}`
}
