import type { CriblUser } from '@/domain/criblUser'
import { NB_KV_PREFIX } from '@/domain/notebookManifest'

type GlobalWindow = typeof globalThis & {
  window?: Window & {
    getCriblUser?: () => Promise<CriblUser>
  }
}

let cachedRootPromise: Promise<string> | null = null

/** Test hook: clear cached notebook library KV root. */
export function resetNotebookLibraryKvRootCacheForTests(): void {
  cachedRootPromise = null
}

/**
 * Resolves the KV path prefix for the saved-notebook library.
 * When `window.getCriblUser` is available and returns a user with non-empty
 * `id` and `username`, notebooks are stored under
 * `{@link NB_KV_PREFIX}/u/{id}/{username}`. Otherwise uses {@link NB_KV_PREFIX}
 * (pack-wide legacy layout).
 */
export function resolveNotebookLibraryKvRoot(): Promise<string> {
  if (cachedRootPromise) return cachedRootPromise
  cachedRootPromise = resolveNotebookLibraryKvRootUncached()
  return cachedRootPromise
}

async function resolveNotebookLibraryKvRootUncached(): Promise<string> {
  try {
    const w = (globalThis as GlobalWindow).window
    if (!w) return NB_KV_PREFIX
    const fn = w.getCriblUser
    if (typeof fn !== 'function') return NB_KV_PREFIX
    const user = await fn()
    const id = typeof user?.id === 'string' ? user.id.trim() : ''
    const username = typeof user?.username === 'string' ? user.username.trim() : ''
    if (!id || !username) return NB_KV_PREFIX
    return `${NB_KV_PREFIX}/u/${encodeURIComponent(id)}/${encodeURIComponent(username)}`
  } catch {
    return NB_KV_PREFIX
  }
}
