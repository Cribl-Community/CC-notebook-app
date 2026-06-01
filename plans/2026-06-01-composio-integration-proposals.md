## Solution Proposals

Context:
- Request: Integrate Composio.io via Python SDK as an example notebook that showcases key usage patterns.
- Research Source: `research/2026-06-01-composio-python-sdk-example-research.md`

### Pyodide compatibility constraint (validated 2026-06-01)

The top-level `composio` package (v0.13.1) **cannot be installed in Pyodide** due to a hard
dependency on `openai`, which in turn requires `jiter` — a Rust extension with no Pyodide/WASM
wheel on PyPI. `pysher` (also a hard dep) only ships as an sdist and uses Python sockets, which
are not available in Pyodide. See research addendum for full dep chain.

The Pyodide-compatible substitute is **`composio-client`** (v1.39.0), the auto-generated
OpenAPI HTTP client that the full SDK uses internally. It exposes the same Composio REST
endpoints with typed request/response models and has no native extensions.

---

Proposal 1 — Bundled `composio-client` notebook + proxy path allowlist (recommended)
- Overview: Add a new notebook under `public/Examples` that installs `composio-client` via
  `micropip`, demonstrates client initialization, 1-2 representative API flows (list toolkits,
  execute an action), result inspection, and an AI prompt scaffold. Register metadata via
  `vite.examplesManifestPlugin.ts`. Add `backend.composio.dev` to `config/proxies.yml` with a
  strict path allowlist only — **no** KV `headers.inject`. Users replace **placeholder** API key
  (and any other secrets) in a dedicated notebook cell before running; committed file stays
  placeholder-only.
- Key Changes:
  - New notebook: `public/Examples/Composio_Python_SDK.ipynb`
  - Install cell: `micropip.install('composio-client==1.39.0')` (all pure Python, no pins needed)
  - Credentials cell: placeholders only (e.g. `<REPLACE_AT_RUNTIME>`), with markdown warning not to commit real keys
  - Examples metadata: `vite.examplesManifestPlugin.ts`
  - Proxy: `config/proxies.yml` — host + `paths.allowlist` only (no Composio `headers.inject`)
  - Docs maintenance note: `docs/PYODIDE_CUSTOMIZATIONS.md`
  - Optional changelog: `src/features/welcome/releaseNotes.ts`
  - Validation touchpoints: examples unit tests + manifest-driven E2E
- Trade-offs:
  - Pros: Pyodide-compatible, aligns with existing architecture, no app runtime changes, low
    regression surface. `composio-client` IS the SDK's HTTP layer — all real API calls are made
    through it.
  - Cons: Users interacting with the notebook see `composio_client` imports rather than the
    top-level `composio` namespace. Add a clear markdown note explaining that the full `composio`
    package requires native Python and why `composio-client` is used here.
  - Cons (auth): Keys typed into cells can leak via save/commit or screenshots — acceptable for a
    **demo** if placeholders ship in git and docs stress hygiene; **not** equivalent to KV injection.
- Validation:
  - `npm test`
  - Verify manifest generation and Welcome entry visibility
  - Manual open/run for the new notebook in dev; optionally staging E2E matrix run
- Open Questions (resolved):
  - Host: `backend.composio.dev`; auth: user replaces placeholders in notebook; client sends API key header (confirm name vs Composio docs at implement time)
  - Path allowlist: `/api/v3.1/toolkits`, `/api/v3.1/tools`
  - Pyodide compatibility: confirmed via dep-chain audit (see research addendum)

Proposal 2 — Pure `httpx` REST notebook (no SDK package install)
- Overview: Demonstrate Composio REST calls directly via `httpx` (already a Pyodide built-in),
  with lightweight helper wrappers. Same manifest/proxy changes as Proposal 1.
- Trade-offs:
  - Pros: zero install overhead, smallest possible footprint.
  - Cons: no typed SDK models; weaker claim to "using their Python SDK". `composio-client` already
    wraps `httpx` and adds value (type checking, structured errors) with negligible extra cost.
- Open Questions:
  - Whether this is preferable if the `composio-client` install cell adds notable first-run delay
    (unlikely — it is a small pure-Python package with no secondary downloads).

### Chosen proposal

**Proposal 1** (`composio-client` notebook). It uses the real Composio SDK transport layer,
is confirmed Pyodide-compatible, and matches this repo's existing SDK notebook conventions.
The install caveat is clearly documented in both the notebook and maintenance docs.
