/**
 * Must stay aligned with the `pyodide` devDependency in package.json.
 * Extra wheel packages load from jsDelivr; core runtime loads from same origin.
 */
export const PYODIDE_RELEASE = '0.29.3' as const

/** Pyodide full-distribution base (wheels + lock). Used as `loadPyodide({ packageBaseUrl })`. */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/` as const

/**
 * Absolute URL for the Pyodide runtime copied into `public/pyodide/` (served beside the built SPA).
 *
 * Must resolve `import.meta.env.BASE_URL` against the **document URL**, not `origin` alone — otherwise
 * a Cribl Apps install under e.g. `/app-ui/<pack>/` requests `/pyodide/pyodide.js` at the site root
 * (404 or ORB-blocked HTML) instead of `/app-ui/<pack>/pyodide/pyodide.js`.
 *
 * We use `document.baseURI` so `<base href>` (if ever added) is respected; it falls back to the full
 * location when needed.
 */
export function getSameOriginPyodideBaseUrl(): string {
  const base = import.meta.env.BASE_URL || '/'
  const documentBase = typeof document !== 'undefined' ? document.baseURI : window.location.href
  const root = new URL(base, documentBase)
  return new URL('pyodide/', root).href
}

/** Same-origin lock file (matches the runtime copied into `public/pyodide/` at build). */
export function getSameOriginPyodideLockFileUrl(): string {
  return new URL('pyodide-lock.json', getSameOriginPyodideBaseUrl()).href
}
