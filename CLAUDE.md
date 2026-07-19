# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # Vite dev server with HMR
npm run build      # TypeScript check (tsc -b) then Vite bundle → dist/
npm run lint       # ESLint
npm run preview    # Preview production build locally
npm run audit      # npm audit --audit-level=moderate (runs first inside `package`)
npm run package    # audit + build + create .tgz in build/ for Cribl deployment
npm test           # Vitest (JSDOM + React Testing Library) — UI hooks,
                   # providers, reducer, executors, and an App smoke test
npm run update:cribl-api        # Regenerate the %%cribl_api OpenAPI catalog index
npm run update:cribl-api:release # Same, from the OpenAPI release channel
npm run e2e:install  # Playwright browsers (once per machine)
npm run e2e:auth     # Save staging login session to e2e/.auth/ (headed)
npm run e2e          # Playwright vs staging (needs e2e/.env + saved session)
npm run e2e:quick    # Same, minus @slow / @examples-all / Pyodide-heavy phase
npm run e2e:slow     # @slow only (excludes @heavy); pair with e2e:quick via `npm run e2e`
npm run e2e:slow:all # All @slow specs including @heavy (Anomaly PyOD notebook)
npm run e2e:examples     # Run All for every manifest example except @heavy (single worker)
npm run e2e:examples:all # Same including Anomaly PyOD (@heavy)
npm run e2e:examples:from-cribl-search # Run All from "Cribl Search Examples" onward
npm run e2e:report # Open last Playwright HTML report
npm run deploy:staging   # PUT .tgz to leader /api/v1/apps (+ preinstall + register); CRIBL_API_TOKEN + CRIBL_E2E_BASE_URL or CRIBL_DEPLOY_BASE_URL
npm run release:github-notes -- X.Y.Z   # Print GitHub Release Markdown for semver X.Y.Z (from releaseNotes.ts)
```

**GitHub Releases:** Prepend an entry to `src/features/welcome/releaseNotes.ts` (newest first) for the version you are about to release. Optionally bump `package.json` to the same version (keeps the in-app welcome screen current; not required by CI). Merge to the default branch, then push a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag triggers `.github/workflows/release.yml`, which lints, packages at the tag's version (leading `v` stripped), uploads `build/*.tgz`, and sets the release description from the curated notes prepended to GitHub's auto-generated commit list. Pre-tag dry-run: `npm ci && npm run lint && npm run package -- --version X.Y.Z && ls build/*.tgz`.

Tests live next to the code they cover (`*.test.ts` / `*.test.tsx`) and
run against a JSDOM environment. Setup lives in `src/testing/setup.ts`
and wires up `@testing-library/jest-dom` matchers + automatic cleanup.

Staging regression and performance budgets use Playwright (`e2e/`); see
[`docs/E2E_STAGING.md`](./docs/E2E_STAGING.md). Never commit `e2e/.env`,
`e2e/.auth/`, or API tokens.

## Architecture

This is a React 19 + TypeScript SPA that runs as a **Cribl App Platform widget** — loaded inside a sandboxed iframe within the Cribl UI. It is packaged as a `.tgz` and deployed as a Cribl App.

For a task-oriented map of directories and entry files, see [`docs/NAVIGATE.md`](./docs/NAVIGATE.md).

### Source layout (feature-sliced hexagonal)

```
src/
  app/           Composition root + cross-cutting React providers
    App.tsx      Provider nesting (Env → Theme → AiCode → Dialog → Search →
                 Lookup → NotebookRepo → Kernel → NotebookPage)
    providers/   Env, Theme, AiCode, Dialog, Search, Lookup, NotebookRepo, Kernel
    styles/      Capra theme helpers + --nb-* bridge (capraTheme.ts, capra-nb-bridge.css)
  domain/        Shared DTOs for port contracts (kernel messages, manifest, search)
  features/      Product features — one folder per vertical
    notebook/      model, reducer, codec, executor, hooks, ui, widgets (NotebookPage lives here)
    library/       manifest + NotebookSidebar + useNotebookLibrary
    cribl-search/  %%cribl_search + lookup magics, KQL editor + output
    cribl-api/     %%cribl_api cell magic + OpenAPI catalog/completions
    ai-riptide/    Riptide AI code gen + AiCodeService adapter
    examples/      Examples manifest + useExamples hook
    welcome/       WelcomePage + release notes + proxy smoke check
  platform/    Adapters for real I/O (Pyodide, Cribl KV/Search/AI clients,
               env detection, static assets, port adapters)
  ports/       Interfaces features depend on
               (KernelPort, NotebookRepo, AiCodeService, SearchService,
                LookupService, DialogService, EnvService)
  ui/          Framework-agnostic UI primitives
               (currently CodeMirror python/KQL highlighting)
  testing/     Test setup + shared smoke tests
```

Full layering, port tables, execution pipeline, and recipes:
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).

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

The app runs inside a sandboxed Cribl iframe. The platform injects read-only
globals (`CRIBL_API_URL`, `CRIBL_BASE_PATH`, optional `getCriblUser`), transparently
proxies and authenticates every `fetch()` to `CRIBL_API_URL`, and routes declared
external domains through the pack proxy.

**All of this — globals, the fetch proxy + URL rewriting, the scoped KV store,
config-group context, and `config/proxies.yml` — is documented in one place:
[`docs/PLATFORM.md`](./docs/PLATFORM.md).** Read it before adding any Cribl API call
or external dependency.

Quick reminders:
- Never handle auth in app code; do not override `window.fetch` (it is locked).
- Use `CRIBL_BASE_PATH` as the React Router basename.
- Search endpoints always use `groupId = default_search` (`/m/default_search/search/…`).

**Pyodide packages:** The kernel loads the interpreter from the app origin, but extra
packages (e.g. after `import matplotlib`, or via `micropip`) are fetched from
`cdn.jsdelivr.net`, `pypi.org`, and `files.pythonhosted.org`, which must stay listed
in `config/proxies.yml`. When upgrading the `pyodide` npm package, update
`src/platform/pyodide/pyodideVersion.ts` and the allowlisted jsDelivr path in
`proxies.yml` to the same release. The Web Worker source lives in
`src/platform/pyodide/kernel.worker.js` and is loaded as a `?raw` import, so it is
type-checked and lintable. Before and after any Pyodide upgrade, review
[`docs/PYODIDE_CUSTOMIZATIONS.md`](./docs/PYODIDE_CUSTOMIZATIONS.md) and re-run its
validation checklist.

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
