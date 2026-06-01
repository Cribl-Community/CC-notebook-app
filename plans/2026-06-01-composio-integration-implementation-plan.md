# Implementation Plan: Composio Python SDK Example Notebook

## Context
Add integration guidance for Composio.io by shipping a bundled example notebook that uses the
Composio SDK HTTP client (`composio-client`) and demonstrates key usage patterns inside this
app's Pyodide-based notebook runtime.

> **Pyodide constraint (validated 2026-06-01):** The top-level `composio` package (v0.13.1)
> cannot be installed in Pyodide — it requires `openai` which requires `jiter` (Rust extension,
> no WASM wheel). The correct Pyodide-compatible package is `composio-client==1.39.0`, which is
> the auto-generated OpenAPI HTTP client that `composio` uses internally. It is entirely pure
> Python (`py3-none-any`), installs cleanly via `micropip`, and exposes the same REST API surface.
> See `research/2026-06-01-composio-python-sdk-example-research.md` for the full dep-chain audit.

## Requirements

### Functional
- Add a new bundled notebook demonstrating Composio SDK (`composio-client`) setup + core usage.
- Ensure the notebook appears in the Examples list with metadata (summary/tags/level/runtime/order).
- Ensure required Composio external hosts are declared in `config/proxies.yml` (path allowlist + `headers.inject: x-api-key: kv.composioApiKey`).
- Keep notebook runnable in this app's environment (Pyodide + platform proxy).
- Include a clear markdown note explaining why `composio-client` is used instead of the `composio` package.
- **Credentials:** one-time save-to-KV cell in the notebook where the user pastes their API key and runs it once; the proxy injects `x-api-key` on every subsequent Composio request. Note the `composio` module is never passed the key directly — the platform proxy handles injection.

### Non-functional
- No regressions to existing examples manifest generation.
- Bundled notebook must contain **only** placeholders — never real API keys in the committed `.ipynb`.
- Keep first-run friction reasonable (explicit setup, clear failure messages).

## Research Summary
- Research doc: `research/2026-06-01-composio-python-sdk-example-research.md`
- Chosen proposal: `plans/2026-06-01-composio-integration-proposals.md` (Proposal 1)

## Chosen Approach
Implement a notebook-first Composio integration: add a curated SDK notebook + examples metadata + proxy policy updates, then validate with existing unit and E2E pathways.

## Ordered Sub-Tasks

### 1) ~~Define Composio runtime contract and notebook scenario~~ — RESOLVED

> This task was pre-resolved by the Pyodide compatibility validation on 2026-06-01.
> All decisions below are locked; no further research needed.

**Resolved decisions**

| Decision | Resolution |
|---|---|
| Python package to install | `composio-client==1.39.0` (pure Python, Pyodide-compatible) |
| Why not `composio` (top-level) | Hard dep on `openai → jiter` (Rust, no WASM wheel); also `pysher` (sockets, sdist-only) |
| Composio API base URL | `https://backend.composio.dev` |
| Auth mechanism | User pastes key into a save-to-KV cell in the notebook (runs once); `proxies.yml` `headers.inject: x-api-key: kv.composioApiKey` injects it on every Composio request. Kernel bridge drops all custom headers, so the SDK cannot send `x-api-key` directly. |
| Path allowlist for proxy | `/api/v3.1/` (prefix — covers all Composio v3 endpoints; specific sub-paths cannot be enumerated statically because composio-client also calls per-toolkit paths like `/api/v3/toolkits/{slug}/tools`) |
| Notebook scenario | 1) Install + init client; 2) List available toolkits; 3) List tools for one toolkit; 4) Execute one action; 5) Inspect structured result; optional chart/AI prompt cell |
| Pyodide transitive dep check | `anyio`, `distro`, `httpx`, `pydantic`, `sniffio`, `typing-extensions` — all pure Python ✅ |

**Scope / Files (for documentation update only)**
- `plans/2026-06-01-composio-integration-implementation-plan.md` — this document (already updated)

### 2) Add Composio host policy to proxy config
**Goal:** Allow outbound `fetch` to Composio through the pack proxy; inject `x-api-key` from the app KV store (key: `composioApiKey`) because the Pyodide kernel bridge strips all custom headers from Python `fetch()` calls.

**Scope / Files**
- `config/proxies.yml`
- If required by new invariants: `src/features/welcome/proxiesConfig.test.ts`

**Actions**
- Add `backend.composio.dev` section with:
  - `paths.allowlist`: `/api/v3.1/` (single prefix covering all v3 endpoints — specific sub-paths like `/api/v3/toolkits/{slug}/tools` cannot be enumerated statically)
  - Add `headers.inject: x-api-key: kv.composioApiKey` (required: kernel bridge strips custom headers, so proxy injection is the only way auth reaches the Composio API).
- Keep existing Pyodide/PyPI host entries (`cdn.jsdelivr.net`, `pypi.org`, `files.pythonhosted.org`) unchanged.
- During implementation, confirm the platform forwards the client-supplied `x-api-key` (or equivalent) on proxied external requests; if a header is stripped, document the workaround or adjust the notebook to use an allowed pattern.

**Acceptance criteria**
- `config/proxies.yml` includes only the minimal needed Composio hosts/paths.
- No Composio secrets in repo; bundled notebook uses a `<YOUR_COMPOSIO_API_KEY>` placeholder; real value is saved to KV store at runtime.
- Existing proxy tests pass; add/update tests only if validation logic changes.

### 3) Author bundled Composio SDK notebook
**Goal:** Provide a runnable, educational notebook demonstrating key Composio SDK client patterns.

**Scope / Files**
- New: `public/Examples/Composio_Python_SDK.ipynb`
- Required update: `docs/PYODIDE_CUSTOMIZATIONS.md` (add Composio `composio-client` pinning note)

**Package install**
```python
import micropip
await micropip.install('composio-client==1.39.0')
```
No additional pins needed — all transitive deps are pure Python.

**Notebook cell structure**
1. Title + intro markdown: what Composio is, what you'll learn
2. **Pyodide caveat markdown**: explain that the full `composio` package requires native Python
   (`jiter` Rust extension); `composio-client` is its underlying HTTP layer and is used here
3. Setup cell: `micropip.install('composio-client==1.39.0')`
4. **Credentials cell (save-to-KV):** `COMPOSIO_API_KEY = "<YOUR_COMPOSIO_API_KEY>"` placeholder + `pyfetch PUT kvstore/composioApiKey` call; and optional
   `COMPOSIO_BASE_URL = "https://backend.composio.dev"` — markdown above instructs users to paste
   their key **only here**, run locally, and **not** save/commit the notebook with real values.
5. Init cell: instantiate `ComposioClient` (or equivalent) with base URL and default headers using
   after the one-time KV save step
6. Workflow cell 1: list available toolkits — checkpoint: print toolkit names/count
7. Workflow cell 2: list tools for a specific toolkit (e.g. GitHub) — checkpoint: first N tool
   names
8. Workflow cell 3: execute one action — checkpoint: inspect structured result dict
9. Optional summary/chart cell (e.g. bar chart of tool counts per toolkit)
10. AI prompt scaffold cell for iterative exploration

**Actions**
- Follow existing SDK notebook structure used in `Cribl_Python_SDK.ipynb` (cells 0-9).
- Add clear markdown for prerequisites (replace placeholders before Run All), common failure modes
  (`401 Unauthorized`, proxy path not allowlisted, forgot to replace placeholder), and expected checkpoint outputs.
- Committed notebook must use **only** obvious placeholders (never real keys).
- Empty `outputs` arrays on all cells (consistent with other bundled examples).

**Acceptance criteria**
- Notebook opens via Welcome and executes sequentially in dev runtime after the user replaces placeholders with a valid API key.
- Each checkpoint cell produces visible, non-error output once credentials are set.
- Committed `.ipynb` contains no real secrets — only placeholders.
- `docs/PYODIDE_CUSTOMIZATIONS.md` includes a note mirroring the pattern for `cribl-control-plane`.

### 4) Register metadata for Examples manifest ordering and discoverability
**Goal:** Ensure the notebook is presented correctly in Welcome examples.

**Scope / Files**
- `vite.examplesManifestPlugin.ts`
- Generated at build/dev time: `public/Examples/manifest.json` (gitignored)

**Actions**
- Add `Composio_Python_SDK.ipynb` entry to `EXAMPLE_METADATA` with summary/tags/level/runtime/recommendedOrder.
- Verify generated manifest includes descriptor fields for the new notebook.

**Acceptance criteria**
- Welcome examples list includes the notebook with intended label/order/description.
- Existing manifest parsing/selection flow continues to work.

### 5) Validate with unit + smoke + optional staging matrix
**Goal:** Catch regressions and confirm notebook integration behavior.

**Scope / Files**
- Existing tests: `src/features/examples/useExamples.test.tsx`, `src/features/examples/examplesManifest.test.ts`, `src/features/welcome/proxiesConfig.test.ts`
- Optional staging E2E: `e2e/specs/all-example-notebooks.spec.ts` (manifest-driven pick-up, likely no code change)

**Actions**
- Run `npm test` and fix any failures.
- Run targeted checks for manifest generation and example open flow.
- Optionally run `npm run e2e:examples` in staging when credentials/environment are available.
- **Staging note:** With placeholder-only keys in git, `Run All` against live Composio may 401 unless the spec tenant injects secrets or the notebook short-circuits when the placeholder is still present (decide at implement time; may require an entry in `ALLOWED_INTENTIONAL_ERROR_ENAMES` or a skip pattern if E2E must stay green).

**Acceptance criteria**
- Local test suite passes for changed areas.
- New notebook is included in manifest and opens from Welcome.
- No new critical notebook errors in validation runs.

### 6) Document and communicate the new example
**Goal:** Leave maintainers and users with clear discoverability and maintenance guidance.

**Scope / Files**
- `src/features/welcome/releaseNotes.ts` (if release-note update is in scope)
- Optional docs note in `docs/NAVIGATE.md` or a focused research/plan addendum

**Actions**
- Add concise changelog entry describing the new Composio SDK example and any setup caveats.
- Document that users must replace in-notebook placeholders at runtime and must not commit notebooks containing real keys.

**Acceptance criteria**
- User-facing note exists for the new example.
- Maintenance notes cover any SDK pinning or proxy assumptions.

## Testing Plan
- Unit: `npm test`
- Build sanity: `npm run build`
- Manual:
  - Start app, open Welcome examples, launch `Composio_Python_SDK.ipynb`
  - Run cells top-to-bottom and verify expected checkpoints
  - Validate proxy allowlist + notebook placeholder → real key replacement flow (local only)
- Optional staging:
  - `npm run e2e:examples` (or targeted spec execution)

## Rollout / Risk Controls
- Keep integration notebook-scoped (no feature runtime architecture changes).
- Use strict proxy allowlists (`/api/v3.1/` paths only). **Security trade-off:** API keys live in notebook cells at runtime; users must not commit filled-in values; consider org policy before promoting this pattern beyond examples.
- The `composio-client` Pyodide compatibility has been confirmed by dep-chain audit; no native
  extensions in the install graph. No fallback strategy needed for this blocker.
- If Composio REST API shape changes between `composio-client` versions, pin to `==1.39.0` in
  the notebook install cell (already planned). Update the pin when bumping is justified.

## Open Questions — RESOLVED

| Question | Resolution |
|---|---|
| Exact Composio domain/path/auth contract | `backend.composio.dev`, `/api/v3.1/...`; auth via notebook placeholders → client sends `x-api-key` (confirm exact header name against Composio docs at implement time) |
| Pyodide compatibility of SDK | `composio` (top-level) blocked; `composio-client==1.39.0` confirmed compatible |
| Recommended order in Welcome list | Place at `recommendedOrder: 10` (after existing advanced notebooks); `level: advanced` |
