/**
 * Must stay aligned with the `pyodide` devDependency in package.json.
 * Extra wheel packages load from jsDelivr; core runtime loads from same origin.
 */
export const PYODIDE_RELEASE = '0.29.3' as const

/** Pyodide full-distribution base (wheels + lock). Used as `loadPyodide({ packageBaseUrl })`. */
export const PYODIDE_PACKAGE_BASE_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_RELEASE}/full/` as const
