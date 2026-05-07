# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # TypeScript check (tsc -b) then Vite bundle → dist/
npm run lint       # ESLint
npm run preview    # Preview production build locally
npm run package    # Build + create .tgz in build/ for Cribl deployment
npm test           # Vitest (JSDOM + React Testing Library) — UI hooks,
                   # providers, reducer, executors, and an App smoke test
```

Tests live next to the code they cover (`*.test.ts` / `*.test.tsx`) and
run against a JSDOM environment. Setup lives in `src/testing/setup.ts`
and wires up `@testing-library/jest-dom` matchers + automatic cleanup.

## Architecture

This is a React 19 + TypeScript SPA that runs as a **Cribl App Platform widget** — loaded inside a sandboxed iframe within the Cribl UI. It is packaged as a `.tgz` and deployed as a Cribl App.

### Source layout (feature-sliced hexagonal)

```
src/
  app/           Composition root + cross-cutting React providers
    App.tsx
    providers/   AiCodeProvider, DialogProvider, EnvProvider, ThemeProvider
  domain/        Shared DTOs for port contracts
  features/      Product features — one folder per vertical
    notebook/      model, reducer, codec, executor, hooks, ui (NotebookPage lives here)
    library/       manifest + NotebookSidebar + useNotebookLibrary
    cribl-search/  %cribl_search magic parser/renderer
    ai-riptide/    Riptide AI code gen + AiCodeService adapter
    examples/      Examples manifest + useExamples hook
    welcome/       WelcomePage + release notes
  platform/    Adapters for real I/O (Pyodide, Cribl KV, Search, AI,
               env detection, static assets)
  ports/       Interfaces features depend on
               (KernelPort, NotebookRepo, AiCodeService, SearchService,
                DialogService, EnvService)
  ui/          Framework-agnostic UI primitives
               (currently CodeMirror python/KQL highlighting)
  testing/     Test setup + shared smoke tests
```

Import aliases (`tsconfig.app.json > paths`):
`@/*`, `@app/*`, `@domain/*`, `@features/*`, `@platform/*`, `@ports/*`, `@ui/*`,
`@testing/*`. Prefer aliases over relative paths that cross layer
boundaries so the layering is obvious in every import.

Rules of thumb:
- Features **never** import from each other except through their public
  surface (reducer, hook, or UI component). Cross-feature coordination
  is done in `app/` (the composition root) and via ports.
- Features import from `ports/*` (interfaces) and from `platform/*`
  (real adapters) — not the other way around.
- `app/` is the only layer allowed to reach into `platform/` to
  instantiate adapters and pass them down via providers.

### Platform Integration

The app runs inside a sandboxed iframe. The platform injects globals on `window`:
- `CRIBL_API_URL` — base URL for all Cribl API calls (e.g. `https://localhost:9000/api/v1`)
- `CRIBL_BASE_PATH` — the mount path for this app (e.g. `/app-ui/my-app`)

**All `fetch()` calls to `CRIBL_API_URL` are transparently proxied** through the parent window. Auth headers are injected automatically — never handle auth in app code.

URL rewriting applied by the proxy:
- `/kvstore/*` → scoped to this pack's KV store
- `/proxy/*` → scoped to this pack's proxy
- `https://external-domain.com/*` → routed through `/api/v1/p/{packId}/proxy/external-domain.com/*`
- Standard API calls (`/search/`, etc.) pass through unchanged

React Router must use `CRIBL_BASE_PATH` as basename:
```jsx
<BrowserRouter basename={window.CRIBL_BASE_PATH}>
```

### Key-Value Store

Each app has a scoped KV store accessed via `CRIBL_API_URL`:
- GET `/kvstore/{path}` — retrieve a value
- PUT `/kvstore/{path}` — set a value
- DELETE `/kvstore/{path}` — delete a value
- POST `/kvstore/keys` with `{ prefix: 'my/prefix' }` — list keys

### Config Group Context

Cribl REST API endpoints not under `/system/` are contextual. Use `/m/{groupId}/` prefix to scope to a config group. **Search endpoints must always use `groupId = default_search`** (e.g. `/m/default_search/search/jobs`). List groups via `/master/groups`.

When building a feature, inspect the Cribl REST APIs and understand request context before starting.

### External APIs (`config/proxies.yml`)

Every external domain the app calls must be declared in `config/proxies.yml`. The platform validates this at install time and routes external `fetch()` calls through the pack proxy (rate-limited to 100 req/min, HTTPS only, no private IPs).

```yaml
# config/proxies.yml
api.example.com:
  timeout: 10000
  paths:
    allowlist:
      - /v1/chat/
  headers:
    inject:
      Authorization: "'Bearer ' + kv.apiKey"  # kv.* resolves encrypted KV store values
```

Sensitive headers (`cookie`, `authorization`, `host`, etc.) are always stripped from the original request — use `headers.inject` for auth. Header values support string literals (`"'static'"`) and KV lookups (`kv.myKey`).

**Pyodide packages:** The kernel loads the interpreter from the app origin, but extra packages (for example after `import matplotlib`) are fetched from `cdn.jsdelivr.net` using `packageBaseUrl` in `src/platform/pyodide/PyodideKernel.ts`. That domain must stay listed in `config/proxies.yml`. When upgrading the `pyodide` npm package, update `src/platform/pyodide/pyodideVersion.ts` and the allowlisted path in `proxies.yml` to the same release. The Web Worker source itself lives in `src/platform/pyodide/kernel.worker.js` and is loaded as a `?raw` import, so it is type-checked and lintable. Before and after any Pyodide upgrade, review `docs/PYODIDE_CUSTOMIZATIONS.md` and re-run its validation checklist.

### Local Testing (Pyodide Kernel)

```bash
npm run dev
```

- Standard dev (same-origin): `http://localhost:5173`
  - Shows the Pyodide smoke test in DEV mode; all checks should pass (the `matplotlib` case may be slow the first time while wheels download from jsDelivr).
- Null-origin sandbox test (simulates Cribl App Platform iframe): `http://localhost:5173/sandbox-test.html`
  - Embeds the app in `<iframe sandbox="allow-scripts">` (no `allow-same-origin`).
  - `window.location.origin` inside the iframe will be `"null"`.
  - The smoke test should still pass — proving the kernel works under null-origin constraints.

### Build System

Vite config includes two custom plugins:
- `packageEndpointPlugin` — serves `/package.tgz` for platform integration testing during dev
- `injectScriptFromQueryPlugin` — injects scripts via query params during dev
