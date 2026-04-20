import { PYODIDE_RELEASE } from '../pyodide/pyodideVersion'

/**
 * Probe URLs aligned with `config/proxies.yml` allowlists. Used on the Welcome
 * tab to show whether the Cribl pack proxy can reach each host.
 */
export type ProxySmokeCheckDef = {
  id: string
  /** Key as it appears in proxies.yml (hostname). */
  proxyYamlHost: string
  /** Short label for the UI. */
  label: string
  url: string
}

export function getProxySmokeCheckDefinitions(): ProxySmokeCheckDef[] {
  const v = PYODIDE_RELEASE
  return [
    {
      id: 'jsdelivr',
      proxyYamlHost: 'cdn.jsdelivr.net',
      label: 'jsDelivr — Pyodide full lock',
      url: `https://cdn.jsdelivr.net/pyodide/v${v}/full/pyodide-lock.json`,
    },
    {
      id: 'pypi',
      proxyYamlHost: 'pypi.org',
      label: 'PyPI — package metadata (JSON)',
      url: 'https://pypi.org/pypi/pip/json',
    },
    {
      id: 'files',
      proxyYamlHost: 'files.pythonhosted.org',
      label: 'Python hosted — wheel file',
      // Stable small wheel; path from PyPI JSON for six 1.17.0 (update if 404).
      url:
        'https://files.pythonhosted.org/packages/b7/ce/149a00dd41f10bc29e5921b496af8b574d8413afcd5e30dfa0ed46c2cc5e/six-1.17.0-py2.py3-none-any.whl',
    },
  ]
}

export type ProxySmokeRowResult = {
  def: ProxySmokeCheckDef
  status: 'pending' | 'ok' | 'error'
  httpStatus?: number
  ms?: number
  detail?: string
}

const PROBE_TIMEOUT_MS = 18_000

/**
 * Runs each probe with `fetch` (same global the app uses — Cribl iframe
 * monkey-patches this to go through the pack proxy).
 */
export async function runProxySmokeTests(
  defs: ProxySmokeCheckDef[],
  onRow: (row: ProxySmokeRowResult) => void,
): Promise<void> {
  await Promise.all(
    defs.map(async (def) => {
      onRow({ def, status: 'pending' })
      const t0 = performance.now()
      const ac = new AbortController()
      const timer = window.setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
      try {
        const r = await fetch(def.url, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        })
        const ms = Math.round(performance.now() - t0)
        window.clearTimeout(timer)
        if (r.ok) {
          onRow({ def, status: 'ok', httpStatus: r.status, ms })
        } else {
          onRow({
            def,
            status: 'error',
            httpStatus: r.status,
            ms,
            detail: r.statusText || `HTTP ${r.status}`,
          })
        }
      } catch (e) {
        window.clearTimeout(timer)
        const ms = Math.round(performance.now() - t0)
        const err = e instanceof Error ? e : new Error(String(e))
        const detail =
          err.name === 'AbortError' ? `Timed out after ${PROBE_TIMEOUT_MS / 1000}s` : err.message
        onRow({ def, status: 'error', ms, detail })
      }
    }),
  )
}
