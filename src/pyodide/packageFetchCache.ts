/**
 * Pyodide workers fetch wheels from jsDelivr / PyPI / pythonhosted via the main-thread
 * fetch bridge. Each notebook tab creates a new worker, so without shared caching the same
 * URLs would be hit repeatedly. This module:
 *
 * - Dedupes in-flight GETs for the same URL (multiple tabs / kernels starting together)
 * - Keeps a session memory cache so later kernels reuse bytes without another network hit
 * - Persists successful responses in the Cache API (when available) for faster reloads
 *
 * Same-origin asset fetches do not go through this path (they stay in the worker).
 */
import { PYODIDE_RELEASE } from './pyodideVersion'

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
  if (typeof caches === 'undefined') return null
  try {
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
  if (typeof caches === 'undefined') return
  try {
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
): Promise<SerializedFetchPayload> {
  const fromDisk = await readFromPersistentCache(url)
  if (fromDisk !== null) {
    sessionMemory.set(key, fromDisk)
    return fromDisk
  }

  const r = await window.fetch(url, init)
  const payload = await responseToPayload(r)

  if (r.ok && shouldCacheRemotePackageUrl(url)) {
    await writeToPersistentCache(url, init, payload)
  }

  sessionMemory.set(key, payload)
  return payload
}

/**
 * For remote package GETs that we recognize, returns a Response built from shared cached bytes.
 * Other requests delegate to `window.fetch` unchanged.
 */
export async function fetchWithPackageSessionCache(url: string, init: RequestInit = {}): Promise<Response> {
  const method = (init.method || 'GET').toUpperCase()
  if (method !== 'GET' || !shouldCacheRemotePackageUrl(url) || init.integrity) {
    return window.fetch(url, init)
  }

  const key = cacheKeyForPackageUrl(url)
  const mem = sessionMemory.get(key)
  if (mem) {
    return payloadToResponse(mem)
  }

  let p = inflight.get(key)
  if (!p) {
    p = fetchAndSerialize(url, init, key).finally(() => {
      inflight.delete(key)
    })
    inflight.set(key, p)
  }

  const payload = await p
  return payloadToResponse(payload)
}
