/**
 * Environment discovery — detects whether the SPA is running inside Cribl
 * (with a real API base for KV, Search, and Riptide) or in a local
 * dev/test sandbox where Cribl features are mocked or disabled.
 *
 * Cribl injects `window.CRIBL_API_URL` at runtime; its absence means we are
 * running under `npm run dev`, inside unit tests, or otherwise outside the
 * platform shell.
 */
import type { EnvService } from '@ports/EnvService'
import { notebookStaticPrefix } from '@platform/staticAssets'

/** Returns empty string when not running inside Cribl (dev / tests). */
export function getCriblApiBase(): string {
  if (typeof window === 'undefined') return ''
  const u = window.CRIBL_API_URL?.trim()
  return u ? u.replace(/\/$/, '') : ''
}

/** True when there's no CRIBL_API_URL — the KV store and Search calls must be stubbed. */
export function isKvMockMode(): boolean {
  return getCriblApiBase() === ''
}

/**
 * Snapshot the environment into a plain object that adheres to `EnvService`.
 * Useful where consumers prefer a port-shaped dependency (e.g. React Context).
 */
export function readEnv(): EnvService {
  const apiBase = getCriblApiBase()
  return {
    apiBase,
    isCriblHosted: apiBase !== '',
    isKvMock: apiBase === '',
    staticAssetPrefix: notebookStaticPrefix(),
  }
}
