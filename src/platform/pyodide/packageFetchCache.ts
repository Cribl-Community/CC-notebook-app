/**
 * Pyodide workers fetch wheels from jsDelivr / PyPI / pythonhosted, and the same-origin
 * runtime tree under `public/pyodide/`, via the main-thread fetch bridge for whitelisted
 * URLs. Each notebook tab creates a new worker, so without shared caching the same
 * URLs would be hit repeatedly. This module:
 *
 * - Dedupes in-flight GETs for the same URL (multiple tabs / kernels starting together)
 * - Keeps a session memory cache so later kernels reuse bytes without another network hit
 * - Persists successful responses in the Cache API (when available) for faster reloads
 *
 * Other same-origin fetches (not under the app Pyodide base) stay in the worker.
 */
import { PYODIDE_RELEASE } from '@platform/pyodide/pyodideVersion'

const CACHE_NAME = `notebook-pyodide-pkgs-v${PYODIDE_RELEASE}`

/** Normalize so two equivalent URLs map to one cache entry. */
export function cacheKeyForPackageUrl(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href
  } catch {
    return url
  }
}

/** Hosts used for wheels / index metadata — aligned with `config/proxies.yml`. */
export function shouldCacheRemotePackageUrl(url: string): boolean {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    return false
  }
  return (
    host === 'cdn.jsdelivr.net' ||
    host === 'pypi.org' ||
    host === 'files.pythonhosted.org' ||
    host === 'www.pypi.org'
  )
}

/**
 * True when `url` is a GET target under the app-hosted Pyodide tree
 * (same `getSameOriginPyodideBaseUrl()` prefix on the document).
 */
export function isAppHostedPyodideUrl(url: string, appPyodideBaseUrl: string): boolean {
  if (!appPyodideBaseUrl) return false
  try {
    const u = new URL(url)
    const b = new URL(appPyodideBaseUrl)
    if (u.origin !== b.origin) return false
    const p = b.pathname
    const childPrefix = p.endsWith('/') ? p : `${p}/`
    return u.pathname === p || u.pathname.startsWith(childPrefix)
  } catch {
    return false
  }
}

/**
 * Returns true for remote registry URLs or same-origin `pyodide/` app assets
 * (when `appPyodideBaseUrl` is provided from the main thread).
 */
export function shouldCachePackageFetchUrl(
  url: string,
  appPyodideBaseUrl: string | undefined,
): boolean {
  if (shouldCacheRemotePackageUrl(url)) return true
  if (appPyodideBaseUrl && isAppHostedPyodideUrl(url, appPyodideBaseUrl)) return true
  return false
}

export type SerializedFetchPayload = {
  status: number
  statusText: string
  headerPairs: [string, string][]
  body: ArrayBuffer
  url: string
}

const sessionMemory = new Map<string, SerializedFetchPayload>()
const inflight = new Map<string, Promise<SerializedFetchPayload>>()

function payloadToResponse(p: SerializedFetchPayload): Response {
  const headers = new Headers()
  for (const [k, v] of p.headerPairs) {
    headers.append(k, v)
  }
  return new Response(p.body.slice(0), {
    status: p.status,
    statusText: p.statusText,
    headers,
  })
}

async function responseToPayload(r: Response): Promise<SerializedFetchPayload> {
  const body = await r.arrayBuffer()
  const headerPairs: [string, string][] = []
  r.headers.forEach((v, k) => {
    headerPairs.push([k, v])
  })
  return {
    status: r.status,
    statusText: r.statusText,
    headerPairs,
    body,
    url: r.url,
  }
}

async function readFromPersistentCache(url: string): Promise<SerializedFetchPayload | null> {
  try {
    // `typeof caches` is inside the try-catch because in a sandboxed iframe (no
    // allow-same-origin) the `caches` global is a getter that throws SecurityError —
    // which typeof does NOT suppress.
    if (typeof caches === 'undefined') return null
    const cache = await caches.open(CACHE_NAME)
    const hit = await cache.match(new Request(url, { method: 'GET' }))
    if (!hit || !hit.ok) return null
    return responseToPayload(hit)
  } catch {
    return null
  }
}

async function writeToPersistentCache(
  requestUrl: string,
  init: RequestInit,
  payload: SerializedFetchPayload,
): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    const cache = await caches.open(CACHE_NAME)
    const res = new Response(payload.body.slice(0), {
      status: payload.status,
      statusText: payload.statusText,
      headers: new Headers(payload.headerPairs),
    })
    await cache.put(new Request(requestUrl, { method: 'GET', credentials: init.credentials }), res)
  } catch {
    // quota, opaque response, etc.
  }
}

async function fetchAndSerialize(
  url: string,
  init: RequestInit,
  key: string,
  appPyodideBaseUrl: string | undefined,
): Promise<SerializedFetchPayload> {
  const fromDisk = await readFromPersistentCache(url)
  if (fromDisk !== null) {
    sessionMemory.set(key, fromDisk)
    return fromDisk
  }

  const r = await window.fetch(url, init)
  const payload = await responseToPayload(r)

  if (r.ok && shouldCachePackageFetchUrl(url, appPyodideBaseUrl)) {
    await writeToPersistentCache(url, init, payload)
  }

  sessionMemory.set(key, payload)
  return payload
}

/**
 * `appPyodideBaseUrl` (from `getSameOriginPyodideBaseUrl()` on the main thread) extends
 * caching to same-origin `pyodide/*` fetches that use this bridge. Omit it to only cache
 * the remote registry allowlist.
 */
export async function fetchWithPackageSessionCache(
  url: string,
  init: RequestInit = {},
  appPyodideBaseUrl?: string,
): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET' || !shouldCachePackageFetchUrl(url, appPyodideBaseUrl) || init.integrity) {
    return window.fetch(url, init)
  }

  const key = cacheKeyForPackageUrl(url)
  const mem = sessionMemory.get(key)
  if (mem) {
    return payloadToResponse(mem)
  }

  let p = inflight.get(key)
  if (!p) {
    p = fetchAndSerialize(url, init, key, appPyodideBaseUrl).finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, p)
  }

  const payload = await p
  return payloadToResponse(payload)
}
