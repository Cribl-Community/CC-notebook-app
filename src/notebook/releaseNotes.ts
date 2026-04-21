/**
 * Append a block when shipping a new version (keep newest first).
 * Mirrors package.json version for the latest entry.
 */
export type ReleaseEntry = {
  version: string
  /** ISO date or human-readable */
  date: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: '1.0.49',
    date: '2026-04-21',
    highlights: ['Packaging: refreshed application bundle for distribution.'],
  },
  {
    version: '1.0.48',
    date: '2026-04-21',
    highlights: ['Packaging: refreshed application bundle for distribution.'],
  },
  {
    version: '1.0.47',
    date: '2026-04-21',
    highlights: [
      'Welcome: bundled Examples are listed from a Vite-generated `public/Examples/manifest.json` (all `*.ipynb` in that folder). Adding or removing notebooks updates the list after dev reload or on the next production build.',
      'Welcome: choose an example from a compact list control (up to ten visible rows) and open it with one click; static asset URLs share `notebookStaticPrefix()` with example notebook loads.',
    ],
  },
  {
    version: '1.0.46',
    date: '2026-04-21',
    highlights: [
      'Architecture: `useTabNotebookRuntime` centralizes per-tab Pyodide kernels, serialized run queues, execution counters, and generation tokens used to drop stale runs after restart/stop.',
      'Cell execution: Cribl Search helpers and `runNotebookCellAfterReady` live in dedicated modules with injectable dependencies for easier unit testing.',
      'Reducer: `ADD_CELL` with a stale `afterId` now appends instead of prepending at index 0; output-area `clear_output(wait=True)` state lives in `notebookOutputAreaSideState.ts` with a short rationale.',
    ],
  },
  {
    version: '1.0.45',
    date: '2026-04-21',
    highlights: [
      'Python “Referenced code” in errors: recognize Pyodide tracebacks that use `File "<cell>", line N` (and related pseudo-filenames / IPython `Input In` lines), not only `<string>`.',
      'When several notebook frames appear in one traceback, only the innermost frame is used for the arrow highlight so line 1 is not mistaken for the fault line.',
    ],
  },
  {
    version: '1.0.44',
    date: '2026-04-21',
    highlights: [
      'Packaging: refreshed application bundle for distribution.',
    ],
  },
  {
    version: '1.0.43',
    date: '2026-04-21',
    highlights: [
      'Python error output now strips ANSI noise and surfaces a compact “Referenced code” snippet from the cell using traceback line references, so failures map to the exact source line faster.',
      'Error cards now include an optional “Suggest Fix” AI footer (Cribl runtime only) that returns a brief, dismissible debugging suggestion instead of opening modal alerts.',
    ],
  },
  {
    version: '1.0.42',
    date: '2026-04-21',
    highlights: [
      'Code cells with top-level ``await`` (e.g. ``await micropip.install("altair")``) now emit ``execute_result`` for a trailing variable line such as ``chart``, matching Jupyter. Previously ``eval_code_async`` ran the cell but never invoked ``displayhook``, so Vega-Lite / Altair output areas stayed empty.',
    ],
  },
  {
    version: '1.0.41',
    date: '2026-04-21',
    highlights: [
      'Vega-Lite / Altair in cells: chart MIME types now rank above the Jupyter widget placeholder so real Vega bundles are not replaced by “interactive rendering not yet implemented”; Altair renderer selection tries jupyterlab, mimetype, and nteract.',
    ],
  },
  {
    version: '1.0.40',
    date: '2026-04-21',
    highlights: [
      'Vega cell output: pin the app bundle to vega-embed 6 + vega-lite 5 so Altair’s Vega-Lite v5 specs match the embedded compiler (fixes blank charts when the console warned that the spec was v5 but npm shipped Vega-Lite v6).',
    ],
  },
  {
    version: '1.0.39',
    date: '2026-04-21',
    highlights: [
      'Altair / Vega-Lite 6: register `application/vnd.vega.v6` and `application/vnd.vegalite.v6` MIME keys (including Altair’s `.json` suffix) and auto-switch Altair to the `jupyterlab` MIME renderer so charts are not emitted as script-heavy HTML (which was sanitized to a blank output).',
    ],
  },
  {
    version: '1.0.38',
    date: '2026-04-21',
    highlights: [
      'Cell output: Matplotlib is still PNG/SVG in the output area; Plotly figures now render as interactive charts from the standard Jupyter MIME type (`application/vnd.plotly.v1+json`). The Plotly UI chunk loads on first chart so the initial app bundle stays smaller.',
      'Cell output: Vega (`application/vnd.vega.v5+json`) and Vega-Lite (`application/vnd.vegalite.v5+json`) specs render with vega-embed—for example Altair charts—alongside Matplotlib and Plotly.',
      'Kernel: IOPub includes Plotly’s MIME type in the formatter allowlist so `display(fig)` and trailing `fig` expressions emit a proper figure bundle, consistent with Jupyter.',
    ],
  },
  {
    version: '1.0.37',
    date: '2026-04-21',
    highlights: [
      'Packaging: refreshed application bundle for distribution.',
    ],
  },
  {
    version: '1.0.36',
    date: '2026-04-21',
    highlights: [
      'Riptide prompt: multiline textarea wraps long text and grows in height as you type or press Enter; Shift+Enter still runs Generate.',
    ],
  },
  {
    version: '1.0.35',
    date: '2026-04-21',
    highlights: [
      'Cells: Clone in the cell toolbar duplicates the cell directly below the original; duplicated code cells start with no outputs and idle execution state.',
    ],
  },
  {
    version: '1.0.34',
    date: '2026-04-21',
    highlights: [
      'Pyodide: same-origin runtime URL now resolves `BASE_URL` against `document.baseURI` so installs under an Apps mount path load `pyodide.js` next to the bundle (fixes ORB / kernel failures when the runtime was requested from the site root).',
    ],
  },
  {
    version: '1.0.33',
    date: '2026-04-21',
    highlights: [
      'Pyodide: runtime and lock file URLs resolve from the app base path and origin — not the client route — so kernels load on nested SPA paths (e.g. trailing slashes) and the lock file stays same-origin for CSP.',
      'Kernel fetch bridge uses the real window fetch; jsDelivr / PyPI / pythonhosted GETs are deduped and session-cached so new notebook tabs reuse wheels without re-downloading when possible.',
      'Worker blob: fixed escaped newline in the lazy jedi completion load so the worker parses reliably.',
    ],
  },
  {
    version: '1.0.32',
    date: '2026-04-21',
    highlights: [
      'Code cells: AI button (Riptide) generates Python from a natural-language description and replaces the cell source when running inside Cribl with AI APIs.',
      'Multiline prompt dialog with Ctrl+Enter / ⌘ Enter to submit.',
      'Clear cell output (⌫) works while a cell is queued (pending); it stays disabled only during actual execution.',
    ],
  },
  {
    version: '1.0.31',
    date: '2026-04-21',
    highlights: [
      'Notebook execution queue behaves more like Jupyter: cells waiting to run show a busy [*] gutter; only the active cell is read-only while executing.',
      'Shift+Enter and Run (▶) run the cell, move selection to the next cell, and insert a new code cell below when you run the last cell.',
      'Stop cancels queued work: pending cells return to idle alongside the usual interrupt of the running cell.',
      'Theme: default is light unless nb-theme is set to dark; the theme picker lists Light first.',
      'Cribl Search example notebook: externaldata sample uses var=kql_df and clarifies the magic header.',
    ],
  },
  {
    version: '1.0.30',
    date: '2026-04-20',
    highlights: [
      '%%cribl_search adds lang=kql|kusto|english. English queries are translated to KQL in Cribl environments before search execution.',
      'KQL translation now uses the internal authenticated endpoint /api/v1/ai/q/agents/kql.',
      'Welcome proxy check now includes the internal Cribl AI endpoint row in addition to jsDelivr, PyPI, and pythonhosted checks.',
      'Cribl Search example notebook now includes both an English-query flow and the original KQL flow with a separate DataFrame and visualization.',
    ],
  },
  {
    version: '1.0.28',
    date: '2026-04-20',
    highlights: [
      'micropip installs from PyPI: kernel fetches now route through the pack proxy, so non-vendored wheels (any pure-Python or wasm32 package on PyPI) work in the staged app.',
      'Welcome tab: Pack proxy check — quick GETs to each host in config/proxies.yml (jsDelivr, PyPI, pythonhosted) with status and timing.',
    ],
  },
  {
    version: '1.0.27',
    date: '2026-04-19',
    highlights: [
      'Welcome tab with product overview, release highlights, and quick links to bundled Examples notebooks.',
      'Bundled Examples: Cribl Search (%%cribl_search) walkthrough and Matplotlib recipes.',
      'Tab key triggers richer Python completion (Jedi) in code cells, in addition to attribute completion after “.”',
      'Default experience opens the Welcome tab instead of an empty Untitled notebook.',
    ],
  },
  {
    version: '1.0.26',
    date: '2026',
    highlights: [
      'Multi-tab notebooks with one Pyodide kernel per tab.',
      'Cribl Search magic cells, KV-backed library, and Jupyter-style outputs.',
    ],
  },
]
