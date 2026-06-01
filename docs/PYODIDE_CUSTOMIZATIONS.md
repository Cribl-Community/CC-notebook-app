# Pyodide Customizations (Upgrade Notes)

This app does not run a stock "out of the box" Pyodide setup. Keep this file
updated whenever `src/platform/pyodide/*` behavior changes.

Use this checklist before upgrading `pyodide` in `package.json`.

## Why this exists

The app runs inside a sandboxed Cribl iframe where:

- Worker and main-thread fetch behavior differ.
- Main-thread `fetch` is patched by the platform (auth/proxy rewrite).
- Blob workers do not automatically inherit that behavior.

Several shims are required for reliability in this environment.

## Customizations by file

## `src/platform/pyodide/pyodideVersion.ts`

- Pins `PYODIDE_RELEASE` and keeps it aligned with the npm dependency.
- Uses same-origin runtime URLs (`public/pyodide/`) via
  `getSameOriginPyodideBaseUrl()`.
- Resolves paths against `document.baseURI` (not only `origin`) so installs
  under `/app-ui/<pack>/` load correct runtime assets.
- Uses a same-origin lock file URL (`getSameOriginPyodideLockFileUrl()`).

Upgrade check:
- Update `PYODIDE_RELEASE`.
- Ensure `public/pyodide/*` assets and lock file match release.

## `src/platform/pyodide/PyodideKernel.ts`

- Loads `kernel.worker.js` as raw source and injects two Python bootstraps:
  - `notebook_complete.py`
  - `notebook_iopub_bootstrap.py`
- Sends worker init payload with:
  - `pyodideBaseUrl`
  - `pyodidePackageBaseUrl`
  - `pyodideLockFileUrl`
  - `appOrigin`
  - `criblApiUrl` (mirrored into Python env var `CRIBL_API_URL`)
- Handles worker `fetch_request` messages in `handleFetchRequest(...)`.
- Deliberately does not forward custom headers to `window.fetch` so Cribl auth
  injection is preserved.
- Uses `fetchWithPackageSessionCache(...)` for dedupe/session/persistent cache.

Upgrade check:
- Verify worker message protocol still matches (`fetch_request`, `fetch_response`,
  `exec`, `complete`, `ready`, `init_error`).
- Reconfirm header-dropping rationale with current platform auth behavior.

## `src/platform/pyodide/kernel.worker.js`

- Overrides global `fetch` inside worker:
  - Forwards cross-origin requests to main-thread fetch bridge.
  - Forwards app-hosted `/pyodide/...` requests to main-thread (cache sharing).
  - Forwards same-origin app API requests (`/api/v1/...`) to main-thread.
  - Uses native worker fetch only for other same-origin URLs.
- Adds `self.caches` no-op polyfill when Cache API throws in sandboxed workers.
- Reconstructs `Response` objects from bridged payloads.
- Initializes Pyodide via `importScripts(pyodide.js)` from same origin.
- Injects `CRIBL_API_URL` into Python `os.environ`.
- Installs completion + IOPub bootstrap Python code at worker init.
- Wraps execution to emit IOPub-like events (`status`, `stream`, `error`).
- **`loadPackagesFromImports(user_cell)`** failures are caught so PyPI-only imports
  still reach `_nb_run` (micropip / auto-import can handle them).

Upgrade check:
- Revalidate fetch-routing conditions after any platform URL/path changes.
- Re-test null-origin/sandbox behavior and CORS-sensitive SDK calls.

## `src/platform/pyodide/packageFetchCache.ts`

- Dedupe in-flight GETs across kernels/tabs.
- Session memory cache.
- Persistent Cache API store keyed by `PYODIDE_RELEASE`.
- Caches:
  - `cdn.jsdelivr.net`
  - `pypi.org` / `www.pypi.org`
  - `files.pythonhosted.org`
  - same-origin app-hosted `pyodide/` URLs when bridged.
- Session memory stores **only `ok` responses**; non-OK bodies (HTML error pages from a flaky proxy) are not reused, which avoids micropip seeing `BadZipFile: File is not a zip file` on a later fetch of the same URL.

Upgrade check:
- Keep allowlist aligned with `config/proxies.yml`.
- Confirm cache key/version strategy still appropriate.

## `src/platform/pyodide/notebook_iopub_bootstrap.py`

- Implements Jupyter-like output bridge used by UI/reducer:
  - `display(...)`
  - `clear_output(wait=...)`
  - `_nb_run(...)` execution wrapper
- Rewrites line-oriented **`%pip install …`** and **`!pip install …`** (Jupyter-style)
  to **`await micropip.install(...)`** before parsing the cell. Only `install` is
  implemented; other pip subcommands print a stderr hint.
- Installs a **`builtins.__import__` wrapper** (Pyodide only): on
  **`ModuleNotFoundError`** for a **top-level** absolute import, runs
  **`micropip.install(<top-level>)`** once via **`pyodide.ffi.run_sync`**, then
  retries. Skips stdlib (`sys.stdlib_module_names`) and `micropip` / `js` /
  `pyodide` / **`scikits`** (namespace, not a distribution). If ``micropip.install``
  fails, the **original** ``ModuleNotFoundError`` is re-raised so optional-import
  patterns (e.g. Plotly → xarray) keep working. **PyPI names may differ from import names**
  (e.g. `Pillow` vs `PIL`); auto-install cannot fix every mismatch.
- Uses IPython formatter where possible; falls back to repr methods.
- Includes MIME allowlist for rich outputs (Plotly, Vega/Vega-Lite, widgets,
  Cribl Search MIME, etc.).
- Patches Altair and Plotly display/show behavior to work in Pyodide notebook
  context.
- **Plotly 6+** on PyPI depends on **narwhals**; unpinned ``micropip.install('plotly')`` can fail or break ``plotly.express`` with pandas in WASM. Pin **Plotly 5.24.x** when micropip installs from PyPI on a cold kernel; **newer Pyodide builds may bundle Plotly 6.x**, so bundled examples use ``importlib.util.find_spec('plotly')`` and **skip** the pin when Plotly is already importable (avoids ``Requested 'plotly==5.24.1', but plotly==6.x is already installed`` from micropip).
- **``cribl-control-plane``** (``public/Examples/Cribl_Python_SDK.ipynb``) depends on **pydantic** / **httpx** with native extensions; pin those to the **Pyodide built-in** versions (WASM wheels) before the SDK so micropip does not pull manylinux ``pydantic-core`` from PyPI. Refresh pins when bumping ``PYODIDE_RELEASE`` (see [packages built in Pyodide](https://pyodide.org/en/stable/usage/packages-in-pyodide.html)).
- **``composio-client``** (``public/Examples/Composio_Python_SDK.ipynb``): use the **``composio-client``** wheel (pure Python, `py3-none-any`), not the top-level **``composio``** package — the latter depends on **``openai`` → ``jiter``** (Rust; no Pyodide wheel). Pin **``composio-client==1.39.0``** to match the dependency line shipped with ``composio`` 0.13.x; bump the pin deliberately when upgrading. Outbound calls target **``backend.composio.dev``** under ``/api/v3/``; that host is declared in ``config/proxies.yml`` with a ``/api/v3/`` prefix allowlist (single prefix covers all v3 sub-paths, which cannot be enumerated statically). The bundled example uses **in-notebook placeholders** for the API key (no KV ``headers.inject``); users replace the placeholder at runtime and must not commit real keys back to git. **Install ``attrs`` before ``composio-client``**: Pyodide’s auto-import hook calls ``micropip.install('attr')`` when it sees ``import attr``, installing an unrelated PyPI package named ``attr`` that lacks ``.s``; pre-installing ``attrs`` ensures the correct module wins ``sys.modules`` first.
- Converts Python exceptions to structured error payloads.

Upgrade check:
- Validate MIME bundle output for Plotly/Altair/widgets still works.
- Confirm formatter hooks remain compatible with upgraded IPython/Pyodide.

## `src/platform/pyodide/notebook_complete.py`

- Custom completion pipeline:
  - fast attribute completion from live globals
  - fallback to Jedi-based completion

Upgrade check:
- Verify Jedi loading/import behavior after version bump.

## Testing expectations after upgrade

At minimum run:

- `npm test`
- `npm run build`
- `npm run dev` and `PyodideSmokeTest` pass
- `sandbox-test.html` pass (null-origin iframe)
- Manual checks:
  - `micropip.install(...)`
  - `%pip install …` / `!pip install …` and a plain `import <pypi_pkg>` auto-install
  - Plotly/Altair output rendering
  - `%%cribl_search` and `%%cribl_api`
  - Python SDK call path that touches `/api/v1/*` (no stuck busy state)
  - Composio example: `micropip` + `composio-client` against `backend.composio.dev` (placeholder key skips live calls)

## Related files to keep in sync

- `package.json` (`pyodide` version)
- `config/proxies.yml` (allowed package hosts / paths)
- `src/platform/pyodide/pyodideVersion.ts` (release + package base URL)
