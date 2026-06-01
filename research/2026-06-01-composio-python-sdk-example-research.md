# Research: Composio Python SDK Example Notebook Integration

## High-level summary

The app already supports bundled notebook examples under `public/Examples`, with a generated manifest and metadata pipeline that powers Welcome-page discovery and one-click open flows. There is no existing Composio integration in the codebase today, so this work is additive and should follow the existing "example notebook only" path unless deeper runtime changes are needed. The current Python SDK example (`Cribl_Python_SDK.ipynb`) demonstrates the expected style: explicit setup/install cells, environment-variable based configuration, observable checkpoint output, visualization, and an AI prompt scaffold cell. External network access from notebook Python code depends on the platform proxy model, meaning any Composio host and auth behavior must be declared in `config/proxies.yml` rather than handled with direct Authorization headers in notebook code. The strongest natural integration point is a new bundled example notebook plus manifest metadata, docs updates, and targeted tests.

## Findings by area

### 1) Bundled example notebook discovery and UX wiring

- Example notebook list is fetched from static `Examples/manifest.json` via `useExamples`, parsed, sorted by `recommendedOrder`, then exposed to Welcome UI state.
  - Reference: `src/features/examples/useExamples.ts:23-56`
- Manifest parsing supports versioned schemas (v1 and v2), with v2 carrying descriptor fields including summary/tags/level/runtime/order.
  - Reference: `src/features/examples/examplesManifest.ts:32-99`
- Opening an example in the notebook workspace fetches `Examples/<filename>`, parses the `.ipynb`, creates a tab title from filename, and restarts kernel for that tab.
  - Reference: `src/features/notebook/hooks/useNotebookLibraryActions.ts:285-313`

### 2) How the manifest is generated and where notebook metadata lives

- Vite plugin scans `public/Examples/*.ipynb`, writes `public/Examples/manifest.json`, and full-reloads in dev when notebook files change.
  - Reference: `vite.examplesManifestPlugin.ts:130-177`
- Notebook-level metadata (summary/tags/level/estimatedRuntime/recommendedOrder) is keyed by filename in `EXAMPLE_METADATA`; missing metadata falls back to defaults.
  - Reference: `vite.examplesManifestPlugin.ts:18-127`

### 3) Existing Python SDK notebook patterns to mirror

- `Cribl_Python_SDK.ipynb` structure includes:
  - setup markdown with install caveats
  - package install cell using `micropip`
  - runtime config via `CRIBL_API_URL` env var
  - SDK usage cell with concrete API calls
  - visualization cell (`matplotlib`)
  - AI prompt template cell for iterative code generation
  - Reference: `public/Examples/Cribl_Python_SDK.ipynb` (cells 0-9)
- Pyodide customization docs call out this notebook specifically and document why package version pinning is necessary for `cribl-control-plane` dependencies.
  - Reference: `docs/PYODIDE_CUSTOMIZATIONS.md:112-114`

### 4) External API/proxy constraints that affect Composio integration

- External domains must be allowlisted in `config/proxies.yml`, with optional path allowlists and header injection.
  - Reference: `config/proxies.yml:1-22`
  - Reference: `AGENTS.md` (External API Calls / `proxies.yml` sections)
- Sensitive headers such as `authorization` are stripped from original forwarded requests; auth is often supplied via `headers.inject` in proxy config (e.g. `kv.*` values) — **the updated Composio example plan instead uses notebook placeholders + client headers** (no KV inject for Composio); implementers should verify which headers the platform forwards for proxied external calls.
  - Reference: `AGENTS.md` (proxies security notes)
- Current proxy config only includes Pyodide and PyPI hosts (`cdn.jsdelivr.net`, `pypi.org`, `files.pythonhosted.org`), so Composio hosts are not yet declared.
  - Reference: `config/proxies.yml:6-20`

### 5) Test and validation paths relevant to adding a new example notebook

- Unit tests validate examples manifest parsing and loading behavior.
  - Reference: `src/features/examples/examplesManifest.test.ts:4-61`
  - Reference: `src/features/examples/useExamples.test.tsx:32-83`
- E2E includes a manifest-driven "run all bundled examples" matrix, so any new example in manifest is automatically included in that suite.
  - Reference: `e2e/specs/all-example-notebooks.spec.ts:26-116`
- Release notes historically record changes to examples/manifest behavior, useful for user-facing changelog updates if desired.
  - Reference: `src/features/welcome/releaseNotes.ts:242-243`

### 6) Existing repo guidance for editing examples

- Repo guidance explicitly expects direct editing of notebooks under `public/Examples/*.ipynb` rather than generation scripts.
  - Reference: `scripts/write-examples-ipynb.mjs:4`

## Gaps / unknowns identified during research

- No in-repo references to Composio SDK usage patterns, package name/version constraints, or endpoint host/path conventions.
- No existing Composio-specific tests or fixtures.
- Composio auth strategy for this example: **placeholders in the notebook** (user replaces at runtime); **no** pack KV `headers.inject` for Composio. Proxy config is path allowlist only.

## Addendum: Pyodide compatibility validation (2026-06-01)

### Finding: `composio` (the top-level SDK package) cannot be installed in Pyodide

The `composio` package (v0.13.1, latest) carries this hard dependency chain:

```
composio 0.13.1
 ├─ openai (hard, not optional)
 │   └─ jiter >=0.10.0  ← Rust extension; manylinux/macOS/Windows only, NO Pyodide/WASM wheel
 └─ pysher >=1.0.8       ← sdist only (no wheel); uses Python sockets (unsupported in Pyodide)
```

`micropip` will fail when attempting `micropip.install('composio')` because it cannot resolve
a compatible wheel for `jiter` in the Pyodide/WASM environment. This is the same class of
problem documented in `docs/PYODIDE_CUSTOMIZATIONS.md:112-114` for `pydantic-core`, but there
is no built-in Pyodide substitute for `jiter`.

### Finding: `composio-client` IS Pyodide-compatible

`composio-client` is the auto-generated OpenAPI HTTP client underlying the full SDK. It exposes
all Composio REST endpoints via typed methods and is entirely pure Python:

```
composio-client 1.39.0  (pinned by composio 0.13.1)
 ├─ anyio           ← pure Python ✅
 ├─ distro          ← pure Python ✅
 ├─ httpx           ← pure Python, Pyodide built-in ✅
 ├─ pydantic        ← Pyodide built-in ✅
 ├─ sniffio         ← pure Python ✅
 └─ typing-extensions ← pure Python ✅
```

All wheels are `py3-none-any` (no native extensions). Install via:
`micropip.install('composio-client==1.39.0')`.

### Recommendation

Use `composio-client` directly in the notebook instead of the `composio` package.
This accesses the same Composio REST API surface with typed request/response models,
is installable in Pyodide without any pins or workarounds, and is the correct choice
given this repo's platform constraints.

- Composio REST API base URL: `https://backend.composio.dev`
- Auth: user replaces **placeholder** values in the notebook (e.g. `COMPOSIO_API_KEY = "<REPLACE_AT_RUNTIME>"`); the client library sends the Composio API key header from those variables. **Do not** use `headers.inject: kv.*` for this example (per plan update). Committed notebook must remain placeholder-only.
- Key paths to allowlist: `/api/v3/toolkits`, `/api/v3/tools`, `/api/v3/actions/execute`.
