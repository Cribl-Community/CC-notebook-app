import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  getProxySmokeCheckDefinitions,
  runProxySmokeTests,
  type ProxySmokeRowResult,
} from '@features/welcome/proxySmokeTest'

export function WelcomeProxyCheck() {
  const defs = useMemo(() => getProxySmokeCheckDefinitions(), [])
  const [rows, setRows] = useState<ProxySmokeRowResult[]>(() =>
    defs.map((def) => ({ def, status: 'pending' as const })),
  )
  const [running, setRunning] = useState(true)

  const run = useCallback(() => {
    setRunning(true)
    setRows(defs.map((def) => ({ def, status: 'pending' as const })))
    void runProxySmokeTests(defs, (row) => {
      setRows((prev) => prev.map((p) => (p.def.id === row.def.id ? row : p)))
    }).finally(() => setRunning(false))
  }, [defs])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void run()
    }, 0)
    return () => window.clearTimeout(id)
  }, [run])

  return (
    <section className="nb-welcome-section nb-welcome-proxy">
      <h2>Pack proxy check</h2>
      <p className="nb-welcome-muted">
        Hosts are read from <code className="nb-welcome-code">config/proxies.yml</code> at build time. Pyodide
        hosts use fixed JSON / wheel probes; other hosts GET the first allowlisted path (non-network
        HTTP errors still count as OK when the proxy returned a response). In Cribl Apps,{' '}
        <code className="nb-welcome-code">fetch</code> is routed through the pack proxy.
      </p>
      <div className="nb-welcome-proxy-actions">
        <button
          type="button"
          className="nb-btn nb-btn-secondary nb-welcome-proxy-rerun"
          onClick={run}
          disabled={running}
        >
          {running ? 'Checking…' : 'Run again'}
        </button>
      </div>
      <ul className="nb-welcome-proxy-list" aria-live="polite">
        {rows.map((row) => (
          <li key={row.def.id} className="nb-welcome-proxy-row">
            <span
              className="nb-welcome-proxy-status"
              data-status={row.status === 'pending' ? 'pending' : row.status === 'ok' ? 'ok' : 'error'}
              title={row.detail}
              aria-label={
                row.status === 'pending'
                  ? `${row.def.proxyYamlHost}: pending`
                  : row.status === 'ok'
                    ? `${row.def.proxyYamlHost}: OK`
                    : `${row.def.proxyYamlHost}: error${row.detail ? `, ${row.detail}` : ''}`
              }
            >
              {row.status === 'pending' ? '…' : row.status === 'ok' ? 'OK' : '!'}
            </span>
            <span className="nb-welcome-proxy-body">
              <span className="nb-welcome-proxy-host">{row.def.proxyYamlHost}</span>
              <span className="nb-welcome-proxy-label">{row.def.label}</span>
              {row.status !== 'pending' && (
                <span className="nb-welcome-proxy-meta">
                  {row.httpStatus != null && <span className="nb-welcome-proxy-http">HTTP {row.httpStatus}</span>}
                  {row.ms != null && <span>{row.ms} ms</span>}
                  {row.status === 'error' && row.detail && (
                    <span className="nb-welcome-proxy-detail">{row.detail}</span>
                  )}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
