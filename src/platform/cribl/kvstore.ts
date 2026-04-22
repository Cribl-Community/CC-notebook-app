/**
 * Pack-scoped KV store via Cribl App Platform fetch proxy (see AGENTS.md).
 * When `window.CRIBL_API_URL` is missing (local Vite), uses an in-memory + sessionStorage mock.
 */

const MOCK_SESSION_KEY = 'nb-kv-mock-v1'

function normalizeKeyPath(path: string): string {
  return path
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .split('/')
    .filter(Boolean)
    .join('/')
}

/** Encode each path segment for URL path (slashes preserved between segments). */
function encodeKeySegments(path: string): string {
  return normalizeKeyPath(path)
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/')
}

function getMockMap(): Map<string, string> {
  type GlobalWithMock = typeof globalThis & { __nbKvMock?: Map<string, string> }
  const g = globalThis as GlobalWithMock
  if (!g.__nbKvMock) {
    g.__nbKvMock = new Map<string, string>()
    try {
      const raw = sessionStorage.getItem(MOCK_SESSION_KEY)
      if (raw) {
        const o = JSON.parse(raw) as Record<string, string>
        for (const [k, v] of Object.entries(o)) {
          g.__nbKvMock.set(k, v)
        }
      }
    } catch {
      /* ignore */
    }
  }
  return g.__nbKvMock
}

function persistMockMap(): void {
  try {
    const m = getMockMap()
    sessionStorage.setItem(MOCK_SESSION_KEY, JSON.stringify(Object.fromEntries(m)))
  } catch {
    /* sessionStorage unavailable in some sandboxes */
  }
}

// Environment detection lives in `@platform/env/env` — re-exported here for
// backwards compatibility with existing call sites. New code should prefer
// importing from `@platform/env/env` (or via the `EnvService` port).
export { getCriblApiBase, isKvMockMode } from '@platform/env/env'
import { getCriblApiBase, isKvMockMode } from '@platform/env/env'

function parseKeysResponse(data: unknown): string[] {
  if (Array.isArray(data)) {
    return data.filter((x): x is string => typeof x === 'string')
  }
  if (data && typeof data === 'object') {
    const keys = (data as { keys?: unknown; items?: unknown }).keys
    if (Array.isArray(keys)) {
      return keys.filter((x): x is string => typeof x === 'string')
    }
    const items = (data as { items?: unknown }).items
    if (Array.isArray(items)) {
      return items.filter((x): x is string => typeof x === 'string')
    }
  }
  return []
}

export async function kvGet(path: string): Promise<string | null> {
  const key = normalizeKeyPath(path)
  if (isKvMockMode()) {
    return getMockMap().get(key) ?? null
  }
  const base = getCriblApiBase()
  const res = await fetch(`${base}/kvstore/${encodeKeySegments(key)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`KV GET failed (${res.status})`)
  return await res.text()
}

export async function kvPut(path: string, body: string): Promise<void> {
  const key = normalizeKeyPath(path)
  if (isKvMockMode()) {
    getMockMap().set(key, body)
    persistMockMap()
    return
  }
  const base = getCriblApiBase()
  const res = await fetch(`${base}/kvstore/${encodeKeySegments(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body,
  })
  if (!res.ok) throw new Error(`KV PUT failed (${res.status})`)
}

export async function kvDelete(path: string): Promise<void> {
  const key = normalizeKeyPath(path)
  if (isKvMockMode()) {
    getMockMap().delete(key)
    persistMockMap()
    return
  }
  const base = getCriblApiBase()
  const res = await fetch(`${base}/kvstore/${encodeKeySegments(key)}`, { method: 'DELETE' })
  if (res.status === 404) return
  if (!res.ok) throw new Error(`KV DELETE failed (${res.status})`)
}

export async function kvListKeys(prefix: string): Promise<string[]> {
  const p = normalizeKeyPath(prefix)
  if (isKvMockMode()) {
    const all = [...getMockMap().keys()]
    return all.filter((k) => k === p || k.startsWith(`${p}/`))
  }
  const base = getCriblApiBase()
  const res = await fetch(`${base}/kvstore/keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefix: p }),
  })
  if (!res.ok) throw new Error(`KV list keys failed (${res.status})`)
  const data: unknown = await res.json()
  return parseKeysResponse(data)
}
