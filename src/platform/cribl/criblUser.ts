import type { CriblUser } from '@/domain/criblUser'
import { NB_KV_PREFIX } from '@/domain/notebookManifest'

type GlobalWindow = typeof globalThis & {
  window?: Window & {
    getCriblUser?: () => Promise<CriblUser>
  }
}

let cachedUsernamePromise: Promise<string | null> | null = null

/** Test hook: clear cached notebook library username. */
export function resetNotebookLibraryKvRootCacheForTests(): void {
  cachedUsernamePromise = null
}

/**
 * Resolves the signed-in user's `username` for per-user KV keys, or `null` for the
 * legacy pack-wide library layout.
 */
export function resolveNotebookLibraryUsername(): Promise<string | null> {
  if (cachedUsernamePromise) return cachedUsernamePromise
  cachedUsernamePromise = resolveNotebookLibraryUsernameUncached()
  return cachedUsernamePromise
}

async function resolveNotebookLibraryUsernameUncached(): Promise<string | null> {
  try {
    const w = (globalThis as GlobalWindow).window
    if (!w) return null
    const fn = w.getCriblUser
    if (typeof fn !== 'function') return null
    const user = await fn()
    const username = typeof user?.username === 'string' ? user.username.trim() : ''
    return username || null
  } catch {
    return null
  }
}

/**
 * Legacy library root (`nb/v1`). Prefer {@link resolveNotebookLibraryUsername} for
 * per-user key scoping via {@link userManifestKey} / {@link userNotebookPayloadKey}.
 */
export function resolveNotebookLibraryKvRoot(): Promise<string> {
  return Promise.resolve(NB_KV_PREFIX)
}
