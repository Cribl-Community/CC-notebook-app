/**
 * Must stay aligned with the `pyodide` devDependency in package.json.
 * Used for jsDelivr full-distribution URLs (wheels); core runtime loads from same origin.
 */
export const PYODIDE_RELEASE = '0.29.3' as const

/** Official Pyodide wheel repo on jsDelivr (fallback when same-origin `./pyodide/full/` is absent). */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/` as const

/** Same-origin URL for vendored wheels (`npm run vendor-pyodide`). */
export function getLocalPyodideFullBaseUrl(): string {
  return new URL('./pyodide/full/', window.location.href).href
}

/**
 * Resolves `loadPyodide({ packageBaseUrl })`:
 * 1. **Local** `./pyodide/full/` only when both `vendored-packages.json` and `pyodide-lock.json` exist (wheels +
 *    trimmed lock from `vendor-pyodide-wheels.mjs`). The lock lists **only** vendored packages so micropip
 *    treats other PyPI packages as not in-repo and fetches them from PyPI (not missing same-origin wheels).
 * 2. Otherwise **jsDelivr** (`PYODIDE_PACKAGE_BASE_URL`) when proxies allow `cdn.jsdelivr.net`.
 */
export async function resolvePyodidePackageBaseUrl(): Promise<string> {
  const local = getLocalPyodideFullBaseUrl()
  try {
    const [vendored, lockfile] = await Promise.all([
      fetch(new URL('vendored-packages.json', local).href, { method: 'GET', cache: 'no-store' }),
      fetch(new URL('pyodide-lock.json', local).href, { method: 'GET', cache: 'no-store' }),
    ])
    if (vendored.ok && lockfile.ok) {
      return local
    }
  } catch {
    // fetch failed (offline, blocked, etc.) — fall through to CDN
  }
  return PYODIDE_PACKAGE_BASE_URL
}
