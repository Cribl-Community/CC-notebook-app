import { useEffect, useMemo, useState } from 'react'
import { parseExamplesManifest } from './examplesManifest'
import { RELEASE_NOTES } from './releaseNotes'
import { notebookStaticPrefix } from './staticAssets'
import { WelcomeProxyCheck } from './WelcomeProxyCheck'

export type WelcomePageProps = {
  onOpenExample: (filename: string) => void
  onNewNotebook: () => void
}

type ExamplesLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; notebooks: string[]; selectedFilename: string }

export function WelcomePage({ onOpenExample, onNewNotebook }: WelcomePageProps) {
  const [top, ...rest] = RELEASE_NOTES
  const staticPrefix = useMemo(() => notebookStaticPrefix(), [])
  const [examplesLoad, setExamplesLoad] = useState<ExamplesLoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch(`${staticPrefix}Examples/manifest.json`)
        if (!res.ok) throw new Error(`Could not load examples list (${res.status})`)
        const json: unknown = await res.json()
        const notebooks = parseExamplesManifest(json)
        if (!notebooks) throw new Error('Invalid examples manifest')
        if (cancelled) return
        const selectedFilename = notebooks[0] ?? ''
        setExamplesLoad({ kind: 'ready', notebooks, selectedFilename })
      } catch (e) {
        if (cancelled) return
        setExamplesLoad({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to load examples',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [staticPrefix])

  return (
    <div className="nb-welcome">
      <header className="nb-welcome-hero">
        <p className="nb-welcome-kicker">Cribl · In-browser notebooks</p>
        <h1 className="nb-welcome-title">Notebook app</h1>
        <p className="nb-welcome-lead">
          Run Python with Pyodide in your browser: pandas, Matplotlib, Cribl Search magic cells, and saved
          notebooks backed by your pack&apos;s KV store—styled like Jupyter, tuned for observability workflows.
        </p>
        <div className="nb-welcome-hero-actions">
          <button type="button" className="nb-btn nb-btn-primary" onClick={onNewNotebook}>
            New notebook
          </button>
        </div>
      </header>

      <section className="nb-welcome-section">
        <h2>How it works</h2>
        <ul className="nb-welcome-list">
          <li>
            <strong>Kernel per tab</strong> — Each notebook tab loads its own Pyodide runtime so work stays
            isolated.
          </li>
          <li>
            <strong>%%cribl_search</strong> — Run KQL against Cribl Search; results become a pandas DataFrame
            with optional rich preview.
          </li>
          <li>
            <strong>Save &amp; organize</strong> — Persist .ipynb to the scoped KV API, with folders in the
            left sidebar.
          </li>
          <li>
            <strong>Real .ipynb</strong> — Download and upload notebooks; metadata titles stay in sync with
            what you see in the UI.
          </li>
        </ul>
      </section>

      <section className="nb-welcome-section">
        <h2>Examples</h2>
        <p className="nb-welcome-muted">
          Bundled notebooks (read-only templates) from <code className="nb-welcome-code">public/Examples</code>.
          Open a copy in a new tab to run cells.
        </p>
        {examplesLoad.kind === 'loading' && (
          <p className="nb-welcome-muted nb-welcome-examples-status">Loading examples…</p>
        )}
        {examplesLoad.kind === 'error' && (
          <p className="nb-welcome-examples-error" role="alert">
            {examplesLoad.message}
          </p>
        )}
        {examplesLoad.kind === 'ready' && examplesLoad.notebooks.length === 0 && (
          <p className="nb-welcome-muted nb-welcome-examples-status">No example notebooks are bundled.</p>
        )}
        {examplesLoad.kind === 'ready' && examplesLoad.notebooks.length > 0 && (
          <div className="nb-welcome-examples-picker">
            <label className="nb-welcome-examples-label" htmlFor="nb-welcome-examples-select">
              Choose an example
            </label>
            <select
              id="nb-welcome-examples-select"
              className="nb-welcome-examples-select"
              size={Math.min(Math.max(examplesLoad.notebooks.length, 1), 10)}
              value={examplesLoad.selectedFilename}
              onChange={(e) =>
                setExamplesLoad((s) =>
                  s.kind === 'ready' ? { ...s, selectedFilename: e.target.value } : s,
                )
              }
              onDoubleClick={(e) => {
                const v = e.currentTarget.value
                if (v) onOpenExample(v)
              }}
            >
              {examplesLoad.notebooks.map((filename) => (
                <option key={filename} value={filename}>
                  {filename}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="nb-btn nb-btn-primary nb-welcome-examples-open"
              disabled={!examplesLoad.selectedFilename}
              onClick={() => onOpenExample(examplesLoad.selectedFilename)}
            >
              Open example
            </button>
            <p className="nb-welcome-muted nb-welcome-examples-hint">
              Names match files under <code className="nb-welcome-code">public/Examples</code>. Double-click a
              row or use Open example.
            </p>
          </div>
        )}
      </section>

      <WelcomeProxyCheck />

      <section className="nb-welcome-section nb-welcome-release">
        <h2>Release notes</h2>
        {top && (
          <div className="nb-welcome-release-latest">
            <div className="nb-welcome-release-head">
              <span className="nb-welcome-version">{top.version}</span>
              <span className="nb-welcome-date">{top.date}</span>
            </div>
            <ul className="nb-welcome-list nb-welcome-list--tight">
              {top.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </div>
        )}
        {rest.length > 0 && (
          <details className="nb-welcome-details">
            <summary>Earlier releases</summary>
            {rest.map((entry) => (
              <div key={entry.version} className="nb-welcome-release-block">
                <div className="nb-welcome-release-head">
                  <span className="nb-welcome-version">{entry.version}</span>
                  <span className="nb-welcome-date">{entry.date}</span>
                </div>
                <ul className="nb-welcome-list nb-welcome-list--tight">
                  {entry.highlights.map((h) => (
                    <li key={h}>{h}</li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
        )}
      </section>
    </div>
  )
}
