import { PYODIDE_RELEASE } from '../pyodide/pyodideVersion'
import { resolveCriblAiHost } from '../cribl/aiHost'
import { AI_TRANSLATE_PATHS } from '../cribl/aiTranslate'

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
  /**
   * GET target. Omitted for `id === 'files'` — the wheel URL is taken from
   * PyPI project JSON at run time so the probe does not depend on a fixed path.
   */
  url?: string
  /**
   * When true, any HTTP response counts as "host reachable through proxy"
   * (still fails on DNS/network/timeout). Useful for endpoints that may return
   * 4xx to anonymous probes.
   */
  acceptHttpErrors?: boolean
}

export function getProxySmokeCheckDefinitions(): ProxySmokeCheckDef[] {
  const v = PYODIDE_RELEASE
  const aiHost = resolveCriblAiHost()
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
      label: 'Python hosted — wheel file (URL from PyPI metadata)',
    },
    {
      id: 'ai',
      proxyYamlHost: aiHost,
      label: 'Cribl AI — natural language to KQL translation API',
      url: `https://${aiHost}${AI_TRANSLATE_PATHS[0]}`,
      acceptHttpErrors: true,
    },
  ]
}

/** Latest pip wheel URL from PyPI JSON — must stay on files.pythonhosted.org. */
export async function resolvePythonHostedWheelProbeUrl(signal?: AbortSignal): Promise<string> {
  const r = await fetch('https://pypi.org/pypi/pip/json', { cache: 'no-store', signal })
  if (!r.ok) {
    throw new Error(`PyPI pip JSON: HTTP ${r.status}`)
  }
  const j = (await r.json()) as {
    urls?: { url?: string; packagetype?: string }[]
  }
  const wheel = j.urls?.find((u) => u.packagetype === 'bdist_wheel' && u.url)
  if (!wheel?.url || !wheel.url.includes('files.pythonhosted.org')) {
    throw new Error('No files.pythonhosted.org wheel in latest pip PyPI JSON')
  }
  return wheel.url
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
      const t0 = performance.now()
      const ac = new AbortController()
      const timer = globalThis.setTimeout(() => ac.abort(), PROBE_TIMEOUT_MS)
      try {
        let targetUrl = def.url
        if (def.id === 'files') {
          targetUrl = await resolvePythonHostedWheelProbeUrl(ac.signal)
        }
        if (!targetUrl) {
          throw new Error('Missing probe URL')
        }
        const r = await fetch(targetUrl, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        })
        const ms = Math.round(performance.now() - t0)
        globalThis.clearTimeout(timer)
        if (r.ok || def.acceptHttpErrors) {
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
        globalThis.clearTimeout(timer)
        const ms = Math.round(performance.now() - t0)
        const err = e instanceof Error ? e : new Error(String(e))
        const detail =
          err.name === 'AbortError' ? `Timed out after ${PROBE_TIMEOUT_MS / 1000}s` : err.message
        onRow({ def, status: 'error', ms, detail })
      }
    }),
  )
}
