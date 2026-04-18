/**
 * Must stay aligned with the `pyodide` devDependency in package.json.
 * Used for jsDelivr full-distribution URLs (wheels); core runtime loads from same origin.
 */
export const PYODIDE_RELEASE = '0.29.3' as const

export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/` as const
