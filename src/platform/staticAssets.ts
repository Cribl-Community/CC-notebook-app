/** Base URL prefix for files under `public/` (respects Vite `base`). */
export function notebookStaticPrefix(): string {
  const base = import.meta.env.BASE_URL || '/'
  return base.endsWith('/') ? base : `${base}/`
}
