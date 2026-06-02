import { PYODIDE_RELEASE } from '@app/providers'
import { parse as parseYaml } from 'yaml'
import proxiesYmlRaw from '../../../config/proxies.yml?raw'

/**
 * Probe URLs aligned with `config/proxies.yml` allowlists. Used on the Welcome
 * tab to show whether the Cribl pack proxy can reach each host.
 */
export type ProxySmokeCheckDef = {
  id: string
  /** Key as it appears in proxies.yml (hostname, or host:port). */
  proxyYamlHost: string
  /** Short label for the UI. */
  label: string
  /**
   * GET target. Omitted when `probeMode === 'pypi-wheel'` — the wheel URL is
   * taken from PyPI project JSON at run time.
   */
  url?: string
  /**
   * When true, any HTTP response counts as "host reachable through proxy"
   * (still fails on DNS/network/timeout). Useful for endpoints that may return
   * 4xx to anonymous probes.
   */
  acceptHttpErrors?: boolean
  /**
   * Resolve latest pip wheel URL from PyPI JSON, then GET that file (must stay
   * on files.pythonhosted.org).
   */
  probeMode?: 'pypi-wheel'
}

type ProxiesDocEntry = {
  paths?: { allowlist?: unknown }
}

function extractAllowlist(entry: unknown): string[] {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return []
  const paths = (entry as ProxiesDocEntry).paths
  if (!paths || typeof paths !== 'object') return []
  const al = paths.allowlist
  if (!Array.isArray(al)) return []
  return al.filter((p): p is string => typeof p === 'string' && p.length > 0)
}

/** Top-level proxy entries from `proxies.yml`, in file order. */
export function parseProxiesYamlEntries(raw: string): { yamlKey: string; allowlist: string[] }[] {
  let doc: unknown
  try {
    doc = parseYaml(raw)
  } catch {
    return []
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return []
  const out: { yamlKey: string; allowlist: string[] }[] = []
  for (const [yamlKey, val] of Object.entries(doc as Record<string, unknown>)) {
    if (typeof yamlKey !== 'string' || !yamlKey.trim()) continue
    out.push({
      yamlKey: yamlKey.trim(),
      allowlist: extractAllowlist(val),
    })
  }
  return out
}

function stableIdForYamlKey(yamlKey: string): string {
  const k = yamlKey.toLowerCase()
  if (k === 'cdn.jsdelivr.net') return 'jsdelivr'
  if (k === 'pypi.org') return 'pypi'
  if (k === 'files.pythonhosted.org') return 'files'
  return `host-${yamlKey.replace(/:/g, '-')}`
}

function hardcodedFallbackDefinitions(): ProxySmokeCheckDef[] {
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
      label: 'Python hosted — wheel file (URL from PyPI metadata)',
      probeMode: 'pypi-wheel',
    },
  ]
}

function buildChecksFromProxiesEntries(
  entries: { yamlKey: string; allowlist: string[] }[],
): ProxySmokeCheckDef[] {
  const v = PYODIDE_RELEASE
  const out: ProxySmokeCheckDef[] = []

  for (const { yamlKey, allowlist } of entries) {
    const k = yamlKey.toLowerCase()
    const id = stableIdForYamlKey(yamlKey)

    if (k === 'cdn.jsdelivr.net') {
      out.push({
        id,
        proxyYamlHost: yamlKey,
        label: 'jsDelivr — Pyodide full lock',
        url: `https://cdn.jsdelivr.net/pyodide/v${v}/full/pyodide-lock.json`,
      })
      continue
    }
    if (k === 'pypi.org') {
      out.push({
        id,
        proxyYamlHost: yamlKey,
        label: 'PyPI — package metadata (JSON)',
        url: 'https://pypi.org/pypi/pip/json',
      })
      continue
    }
    if (k === 'files.pythonhosted.org') {
      out.push({
        id,
        proxyYamlHost: yamlKey,
        label: 'Python hosted — wheel file (URL from PyPI metadata)',
        probeMode: 'pypi-wheel',
      })
      continue
    }

    const prefix = allowlist[0]
    if (!prefix) {
      if (import.meta.env.DEV) {
        console.warn(`[proxySmokeTest] Skipping ${yamlKey}: no paths.allowlist for generic probe`)
      }
      continue
    }
    const pathPart = prefix.startsWith('/') ? prefix : `/${prefix}`
    out.push({
      id,
      proxyYamlHost: yamlKey,
      label: `GET ${pathPart} (any HTTP = proxy OK)`,
      url: `https://${yamlKey}${pathPart}`,
      acceptHttpErrors: true,
    })
  }

  return out
}

export function getProxySmokeCheckDefinitions(): ProxySmokeCheckDef[] {
  const entries = parseProxiesYamlEntries(proxiesYmlRaw)
  if (entries.length === 0) {
    console.error(
      '[proxySmokeTest] Could not parse config/proxies.yml — using built-in Pyodide probes only',
    )
    return hardcodedFallbackDefinitions()
  }
  const built = buildChecksFromProxiesEntries(entries)
  if (built.length === 0) {
    console.error(
      '[proxySmokeTest] No proxy smoke rows built from config/proxies.yml — using built-in Pyodide probes only',
    )
    return hardcodedFallbackDefinitions()
  }
  return built
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
        if (def.probeMode === 'pypi-wheel') {
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
