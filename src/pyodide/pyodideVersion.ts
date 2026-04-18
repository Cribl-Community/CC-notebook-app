/**
 * Must stay aligned with the `pyodide` devDependency in package.json.
 * Used for jsDelivr full-distribution URLs (wheels); core runtime loads from same origin.
 */
export const PYODIDE_RELEASE = '0.29.3' as const

/** CDN fallback when {@link VENDOR_PYODIDE_FULL} is false. */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/` as const

/**
 * TEMP: ship pandas/matplotlib wheels under ./pyodide/full/ (see scripts/vendor-pyodide-wheels.mjs)
 * so the pack proxy does not need to reach jsDelivr. Set to false and drop the vendor step once
 * config/proxies.yml + proxy routing work again. (UI/theme changes do not affect wheel size;
 * `npm run package` enforces a 30 MiB cap on the release tarball.)
 */
export const VENDOR_PYODIDE_FULL = true as const

/** Base URL for Pyodide to fetch extra wheels (same-origin vendor dir or jsDelivr). */
export function getPyodidePackageBaseUrl(): string {
  if (VENDOR_PYODIDE_FULL) {
    return new URL('./pyodide/full/', window.location.href).href
  }
  return PYODIDE_PACKAGE_BASE_URL
}
