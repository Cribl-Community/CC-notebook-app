import { RELEASE_NOTES } from './releaseNotes'

export type WelcomePageProps = {
  onOpenExample: (filename: string) => void
  onNewNotebook: () => void
}

export function WelcomePage({ onOpenExample, onNewNotebook }: WelcomePageProps) {
  const [top, ...rest] = RELEASE_NOTES

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
          Bundled notebooks (read-only templates). Open a copy in a new tab to run cells.
        </p>
        <div className="nb-welcome-cards">
          <button
            type="button"
            className="nb-welcome-card"
            onClick={() => onOpenExample('Cribl_Search_Example.ipynb')}
          >
            <span className="nb-welcome-card-title">Cribl Search</span>
            <span className="nb-welcome-card-desc">
              %%cribl_search parameters, sample KQL, pandas follow-ups, and charts.
            </span>
          </button>
          <button
            type="button"
            className="nb-welcome-card"
            onClick={() => onOpenExample('Matplotlib_Examples.ipynb')}
          >
            <span className="nb-welcome-card-title">Matplotlib</span>
            <span className="nb-welcome-card-desc">Plots from JSON and pandas DataFrames.</span>
          </button>
        </div>
      </section>

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
