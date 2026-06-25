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
    version: '1.2.9',
    date: '2026-06-25',
    highlights: [
      'Library: saved notebooks use **per-user KV paths** when `window.getCriblUser` returns `id` and `username` (`nb/v1/u/{id}/{username}/…`); missing or incomplete user info keeps the legacy pack-wide `nb/v1/…` layout (existing data is not migrated automatically).',
      'Notebook: orchestration split into focused hooks (`useNotebookLibraryWorkspace`, save flow helpers, `cellRunnerQueue`); library KV commands live in testable modules.',
      'Architecture: feature **index barrels** for cross-slice imports; ESLint nudges `app/` and `ui/` toward barrels instead of deep feature paths.',
      'Packaging: build 1.2.9 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.8',
    date: '2026-06-02',
    highlights: [
      'Welcome: **Pack proxy check** reads `config/proxies.yml` at build time and runs a probe row for every declared host (Pyodide CDN / PyPI / pythonhosted keep the existing checks; other hosts GET the first allowlisted path and treat any HTTP response as OK when the proxy path works).',
      'Packaging: build 1.2.8 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.7',
    date: '2026-06-01',
    highlights: [
      'Notebook: markdown cells support embedded images (`data:image` PNG/JPEG/GIF/WebP), paste or **Image** insert (512 KB per image), responsive rendering, and save-time checks including total `.ipynb` size (6 MB).',
      'Notebook: import and examples validate markdown embed size only so notebooks with large plot outputs still open.',
      'Examples: **00 Getting Started Tour** includes a tiny inline PNG and notes on pasting images into markdown.',
      'Examples: **Composio Python SDK** — new bundled notebook using `composio-client` (Pyodide-compatible); paste your API key and explore Composio toolkits and tools in-browser.',
      'Packaging: build 1.2.7 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.6',
    date: '2026-05-23',
    highlights: [
      'Notebook: code cell toolbar — **On/Off** (skip run; greyed when off), **If** run-condition (Python expression; **T** / **F** / **E** badge after run; errors skip the body), fold/show in the same row, and reorganized actions.',
      'Notebook: `cell.metadata.notebook_app` persists `cell_enabled` (when false) and `run_condition` (when not default `True`) in `.ipynb`; condition is evaluated on the kernel before the cell body.',
      'Examples: **00 Getting Started Tour** demonstrates disabled and conditional cells; **Visualisations** includes an optional saved-disabled template cell.',
      'Packaging: build 1.2.6 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.5',
    date: '2026-05-21',
    highlights: [
      'Architecture: shared IOPub output folding and `%%cribl_*` magic line helpers moved to `domain/`; Pyodide imports the same folding module as the notebook reducer (no platform → feature import for that path).',
      'Architecture: default `%%cribl_api` / `%%cribl_search` / lookup executors avoid direct `@platform/cribl/*` imports—production fetch helpers wire in from `executorRegistry` only.',
      'Env: `EnvService` includes `staticAssetPrefix` for `public/` URLs; bundled Pyodide **`PYODIDE_RELEASE`** is re-exported from `@app/providers` so welcome code does not import `platform/pyodide` directly.',
      'Riptide: adapter lives at `app/riptideAiCodeAdapter.ts`; service helpers take an explicit API base (composition root supplies it from env).',
      'Notebook: AI “Suggest fix” uses `useAiCodeService`; ESLint nudges features away from `@platform/*` and stray `@app/*` (providers + documented exceptions remain).',
      'Packaging: build 1.2.5 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.4',
    date: '2026-05-18',
    highlights: [
      'Examples: **`Malware_Hash_Threat_Hunt.ipynb`** — MD5 threat hunt with hosted TI + PE CSVs (Search `externaldata` + HTTP dataset provider + lookup join + charts); default data on `notebook-app-example-data` (no MalwareBazaar Auth-Key required for Run All).',
      'Examples: **`Threat_Hunting_Playbook.ipynb`** — VPC external-IP watchlist on `cribl_search_sample` with lookup save, inner join, `timestats`, and timeline visualization.',
      'Example data: `src/domain/exampleDataUrls.ts` is the single source of truth for hosted CSV URLs; contract tests keep bundled notebooks aligned; `%%cribl_api` provider samples use the PE teaching CSV URL.',
      'Cribl Search: `%%cribl_search` supports `timeout=` (seconds) for slow jobs; optional verbose progress mirroring during result retrieval; clearer generic errors when datasets or external CSV URLs fail.',
      'Staging E2E: `e2e:examples` / `e2e:examples:all` Run All across the examples manifest (`@examples-all`).',
      'Packaging: build 1.2.4 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.3',
    date: '2026-05-16',
    highlights: [
      'Search lookups: `%%cribl_save_search_lookup` exports the DataFrame via `display(..., raw=True)` so the host always receives `application/json` from Pyodide (plain trailing dicts often lacked JSON MIME).',
      'Cribl Search: `%%cribl_search` normalizes KQL with an auto `cribl` prefix when missing (e.g. `$vt_lookups`); queries that start with `externaldata` are sent unchanged so `Anomaly_Detection_PyOD.ipynb` and similar pipelines still run.',
      'Examples: `Cribl_Search_Lookup_Magics.ipynb` — section B uses `%%cribl_api` PUT/POST/DELETE instead of `pyfetch` for reliable JSON bodies; no micropip setup cell for that notebook.',
      'Staging E2E: `@slow` spec runs Run All on the lookup magics example; `docs/E2E_STAGING.md` table updated.',
      'Packaging: build 1.2.3 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.2',
    date: '2026-05-13',
    highlights: [
      'Welcome: **Upload** next to **New notebook** on the welcome tab — opens the same `.ipynb` import flow as the notebook toolbar.',
      'Packaging: build 1.2.2 and refreshed distribution package.',
    ],
  },
  {
    version: '1.2.1',
    date: '2026-05-12',
    highlights: ['Packaging: build 1.2.1 and refreshed distribution package.'],
  },
  {
    version: '1.2.0',
    date: '2026-05-12',
    highlights: [
      'Widgets: Jupyter IOPub `comm_open` / `comm_msg` / `comm_close` messages are routed to a per-kernel `@jupyter-widgets/base-manager` bridge; `IntSlider` and other controls render in cell outputs when the kernel emits the matching MIME and comm traffic.',
      'Pyodide: `_nb_demo_int_slider()` and `_nb_deliver_comm_msg()` in the IOPub bootstrap support the demo and future `ipywidgets` comm delivery from the host.',
      'Packaging: build 1.2.0 and refreshed distribution package.',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-05-10',
    highlights: [
      'Examples: bundled `Anomaly_Detection_PyOD.ipynb` — eighteen detector slots on sliding-window temperatures with per-model **Plotly** charts and anomaly markers (PyOD where supported in Pyodide; **sklearn substitute for …** sections replace Numba/torch-only PyOD models with scikit-learn alternatives); temperatures load via `%%cribl_search` and Cribl Search `externaldata` instead of `pd.read_csv`.',
      'Packaging: build 1.1.0 and refreshed distribution package.',
    ],
  },
  {
    version: '1.0.70',
    date: '2026-05-08',
    highlights: [
      'Pyodide: Jupyter-style `%pip` / `!pip install` lines rewrite to `await micropip.install(...)`; failed top-level imports attempt one `micropip.install` via `run_sync` before erroring; worker continues when `loadPackagesFromImports` cannot resolve PyPI-only modules.',
      'Staging E2E: `pip-magic` spec exercises `%pip` / `!pip` preprocessing (stderr hints, no PyPI).',
      'Packaging: build 1.0.70 and refreshed distribution package.',
    ],
  },
  {
    version: '1.0.69',
    date: '2026-05-08',
    highlights: [
      'Architecture: `SearchService` and kernel factory are wired through app providers; cell runners use the search port instead of calling Cribl Search clients directly.',
      'Architecture: notebook/kernel display types live under `domain/`; Pyodide worker types re-export them. Library KV reads/writes go through `notebookKv` so the repo adapter no longer depends on feature internals.',
      'Packaging: build 1.0.69 and refreshed distribution package.',
    ],
  },
  {
    version: '1.0.68',
    date: '2026-05-07',
    highlights: [
      'Execution: Stop interrupts the running cell and clears queued cells without reloading the Python kernel (uses Pyodide interrupt buffer when SharedArrayBuffer is available).',
      'Cell output: JSON payloads now render in a polished viewer with compact defaults for large payloads and one-click expand/collapse to avoid oversized cells.',
      'Cribl Search: `%%cribl_search` adds `translate_only=true` for `lang=english` cells—translate to KQL and show output without running Search; default English cells still translate and execute as before.',
      'Packaging: build 1.0.68 and refreshed distribution package.',
    ],
  },
  {
    version: '1.0.62',
    date: '2026-05-06',
    highlights: [
      'API/network error handling: `%%cribl_search`, `%%cribl_api`, and AI translation now surface browser CORS/network fetch failures directly in cell output with clearer messaging, instead of leaving cells looking stuck.',
      'Search execution reliability: immediate fetch failures fail fast (no retry/poll loop behavior for CORS-style failures), and failed search status is emitted to the output area right away.',
    ],
  },
  {
    version: '1.0.61',
    date: '2026-04-30',
    highlights: [
      'Riptide (Generate Python): prompts may include Jinja2 before the model sees them—`{{ var }}` pulls notebook globals; filters `| describe` and `| type_name` summarize DataFrames, dicts, lists, and other objects for richer AI context. The saved cell still stores your template text.',
    ],
  },
  {
    version: '1.0.60',
    date: '2026-04-28',
    highlights: [
      'Cribl API cell (`%%cribl_api`): after you pick a REST path from completion, the YAML body is filled in with a `json:` payload. Samples come from the bundled catalog (generated from Cribl OpenAPI specs—examples and JSON request schemas); POST, PUT, and PATCH always get at least `json: {}` when the body was empty.',
      'The OpenAPI catalog generator (`npm run update:cribl-api`) can target latest dev or stable release specs via `CRIBL_OPENAPI_CHANNEL`.',
    ],
  },
  {
    version: '1.0.59',
    date: '2026-04-27',
    highlights: [
      'Release build: package for Cribl App Platform distribution.',
    ],
  },
  {
    version: '1.0.58',
    date: '2026-04-27',
    highlights: [
      'Cribl API cell: `%%cribl_api` authoring — Tab after the HTTP method suggests catalog paths, accepting fills a path (and, when the YAML block is empty, a sample `json` body for POST/PUT). Hover on the first line (method and path) shows a short description from the catalog.',
    ],
  },
  {
    version: '1.0.57',
    date: '2026-04-27',
    highlights: [
      'Cribl Search: `%%cribl_search` supports Jinja2 in the query body (optional `template=auto|on|off`); the kernel expands `{{ variables }}` from the notebook before Search or English→KQL translation. `Cribl_Search_Examples.ipynb` includes templated KQL and English cells.',
    ],
  },
  {
    version: '1.0.56',
    date: '2026-04-23',
    highlights: [
      'UI: the toolbar theme dropdown is now a **style** selector with ten palettes (Cribl Pro, Cribl Midnight, Nord, Dracula, Catppuccin Mocha, Tokyo Night, Rosé Pine, Solarized, Gruvbox, One Monokai). App chrome, surfaces, and code cell syntax tokens follow CSS variables in `src/app/styles/nb-palettes.css`, keyed by `data-nb-style` on the document root; choice persists under `localStorage` `nb-app-style`, with a one-time read of legacy `nb-theme` (light/dark) mapped to Cribl Pro / Cribl Midnight. CodeMirror still takes a light/dark luma hint for its built-in chrome. Added `src/app/styles/nbStyles.ts`, updated `ThemeProvider` + tests, and docs in `docs/ARCHITECTURE.md`.',
    ],
  },
  {
    version: '1.0.55',
    date: '2026-04-22',
    highlights: [
      'Kernel: same-origin `public/pyodide/` fetches (runtime assets) are routed through the main thread like cross-origin fetches, so `packageFetchCache` deduplicates and persists them for additional notebook tabs and reloads. Remote registry allowlist behaviour unchanged. Unit tests for URL matching.',
    ],
  },
  {
    version: '1.0.54',
    date: '2026-04-22',
    highlights: [
      'Cribl Search: fix regression from 1.0.53 where `%%cribl_search` cells were routed to the Python executor and failed with `SyntaxError: invalid syntax` on the magic line. The cell-executor matcher now correctly recognises the double-percent cell magic; added a regression test covering the dispatch path.',
    ],
  },
  {
    version: '1.0.53',
    date: '2026-04-22',
    highlights: [
      'Architecture: reorganised the codebase into a feature-sliced, hexagonal layout (`app/`, `features/`, `platform/`, `ports/`, `ui/`). Path aliases now enforce layering and make intent obvious at the import site.',
      'Architecture: slimmed `NotebookPage` to composition—per-tab kernel lifecycle, workspace state, library, cell execution, notebook style, dialogs, environment, AI code, and examples each live in their own hook or provider.',
      'Architecture: introduced a `CellExecutor` registry so `%cribl_search` and Python execution share a single dispatch point and are independently testable.',
      'Reliability: reducer is now pure—deferred `clear_output { wait: true }` lives on the cell itself rather than a module-level WeakMap; added regression tests.',
      'Kernel: extracted the Pyodide worker source into its own `.worker.js` (type-checked + lintable) while keeping the Blob-URL runtime path.',
      'Testing: added JSDOM + React Testing Library, smoke test for the full App composition, plus unit tests for hooks, providers, and executors.',
      'Docs: new `docs/ARCHITECTURE.md` spells out the layering, import rules, execution pipeline, and recipes for adding features or execution modes.',
    ],
  },
  {
    version: '1.0.52',
    date: '2026-04-22',
    highlights: [
      'Visualisations: `fig.show()` and `chart.show()` now work in Plotly and Altair cells—library display hooks are applied eagerly after imports run, before the trailing expression is evaluated.',
      'Visualisations: Plotly\'s init `display_data` (a script-only 4.8 MB HTML frame) no longer leaves a blank gap above the chart; script-only iframe outputs collapse to zero height.',
      'Visualisations example notebook updated to use `fig.show()` and `chart.show()` idioms.',
    ],
  },
  {
    version: '1.0.51',
    date: '2026-04-22',
    highlights: [
      'Welcome: bundled Examples list and new tabs use readable titles (no `.ipynb` suffix; underscores shown as spaces) while still loading the correct files under `public/Examples`.',
    ],
  },
  {
    version: '1.0.50',
    date: '2026-04-22',
    highlights: [
      'Execution: if several code cells are queued (Run All or multiple runs) and a cell ends with an error, remaining queued cells are skipped and cells that were only waiting return to idle—similar to Jupyter.',
      'After that error the Pyodide kernel keeps running so you can edit and re-run; use Stop when you want to interrupt execution and restart the kernel (Stop still clears pending cells as before).',
    ],
  },
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
      'Style: choose among 10 notebook color themes (Cribl Pro, Nord, Dracula, …) via the toolbar; `nb-app-style` persists, with legacy `nb-theme` light/dark mapped once on read.',
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
