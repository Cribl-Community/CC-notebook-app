import { useRef } from 'react'
import { exampleNotebookDisplayLabel } from '@features/examples/examplesManifest'
import { useExamples } from '@features/examples/useExamples'
import { RELEASE_NOTES } from '@features/welcome/releaseNotes'
import { WelcomeProxyCheck } from '@features/welcome/WelcomeProxyCheck'

export type WelcomePageProps = {
  onOpenExample: (filename: string) => void
  onNewNotebook: () => void
  onImportFile: (file: File) => void
}

export function WelcomePage({ onOpenExample, onNewNotebook, onImportFile }: WelcomePageProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [top, ...rest] = RELEASE_NOTES
  const { state: examplesLoad, setSelected } = useExamples()

  return (
    <div className="nb-welcome">
      <header className="nb-welcome-hero">
        <p className="nb-welcome-kicker">Cribl · In-browser notebooks</p>
        <h1 className="nb-welcome-title">Notebook app</h1>
        <p className="nb-welcome-lead">
          Run Python with Pyodide in your browser: pandas, Matplotlib, Cribl Search and Cribl REST API magic
          cells, and saved notebooks backed by your pack&apos;s KV store—styled like Jupyter, tuned for
          observability workflows.
        </p>
        <div className="nb-welcome-hero-actions">
          <button type="button" className="nb-btn nb-btn-primary" onClick={onNewNotebook}>
            New notebook
          </button>
          <button
            type="button"
            className="nb-btn"
            onClick={() => fileRef.current?.click()}
            title="Open a Jupyter notebook file"
          >
            ⬆ Upload
          </button>
          <input
            ref={fileRef}
            type="file"
            className="nb-toolbar-file-input"
            accept=".ipynb,application/json,.json"
            aria-hidden
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) onImportFile(f)
              e.target.value = ''
            }}
          />
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
            with optional rich preview. English prompts can translate and run, or use{' '}
            <code className="nb-welcome-code">translate_only=true</code> to preview generated KQL without
            executing a search job.
          </li>
          <li>
            <strong>%%cribl_api</strong> — Call Cribl REST endpoints from a cell: set method and path on the
            magic line, optional YAML for query params and JSON body. Tab completion suggests paths from the
            API catalog; choosing one fills in a starter <code className="nb-welcome-code">json:</code> block
            when appropriate.
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
              onChange={(e) => setSelected(e.target.value)}
              onDoubleClick={(e) => {
                const v = e.currentTarget.value
                if (v) onOpenExample(v)
              }}
            >
              {examplesLoad.notebooks.map((example) => (
                <option key={example.filename} value={example.filename}>
                  {example.title || exampleNotebookDisplayLabel(example.filename)}
                </option>
              ))}
            </select>
            {examplesLoad.notebooks
              .filter((x) => x.filename === examplesLoad.selectedFilename)
              .map((selected) => (
                <div key={selected.filename} className="nb-welcome-example-meta">
                  <p className="nb-welcome-example-summary">{selected.summary}</p>
                  <p className="nb-welcome-example-badges">
                    <span className="nb-welcome-example-pill">{selected.level}</span>
                    <span className="nb-welcome-example-pill">{selected.estimatedRuntime}</span>
                    {selected.tags.map((tag) => (
                      <span key={tag} className="nb-welcome-example-pill">
                        {tag}
                      </span>
                    ))}
                  </p>
                </div>
              ))}
            <button
              type="button"
              className="nb-btn nb-btn-primary nb-welcome-examples-open"
              disabled={!examplesLoad.selectedFilename}
              onClick={() => onOpenExample(examplesLoad.selectedFilename)}
            >
              Open example
            </button>
            <p className="nb-welcome-muted nb-welcome-examples-hint">
              Each entry matches a bundled <code className="nb-welcome-code">.ipynb</code> under{' '}
              <code className="nb-welcome-code">public/Examples</code> (shown here without the extension;
              underscores appear as spaces). Double-click a row or use Open example.
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
