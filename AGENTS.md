# Cribl App Platform Developer Guide

## Notebook app architecture (read this first)

This repo is a feature-sliced hexagonal React app. See
[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for the full map and
[`docs/NAVIGATE.md`](./docs/NAVIGATE.md) for where to open first files and task-oriented pointers.
TL;DR:

```
src/
  app/          Composition root (App.tsx, providers/, styles/)
  domain/       Port-level DTOs shared across layers
  features/     Vertical slices (notebook, library, cribl-search,
                cribl-api, ai-riptide, examples, welcome)
  platform/    Real-world adapters (pyodide, cribl, env, staticAssets, adapters)
  ports/       Interfaces features depend on (KernelPort, NotebookRepo,
                AiCodeService, SearchService, LookupService, DialogService, EnvService)
  ui/          Framework-agnostic UI primitives
  testing/     Vitest setup + smoke tests
```

Use alias imports (`@/*`, `@app/*`, `@domain/*`, `@features/*`, `@platform/*`,
`@ports/*`, `@ui/*`, `@testing/*`) to keep layering obvious. When one feature imports
another, use that slice’s `index.ts` barrel (`@features/library`, `@features/welcome`,
…) rather than deep paths. Features must not cross into each other's internals or into
`platform/*` directly — depend on a port.

Run tests with `npm test` (Vitest + JSDOM + React Testing Library).

**Staging E2E:** Playwright drives a real tenant (Apps iframe + notebook shell).
Use `npm run e2e:auth` once to save session state (gitignored), then `npm run e2e`
(or `npm run e2e:quick` to skip the slow Pyodide-heavy phase). For `@heavy` specs (Anomaly PyOD Run All), run `npm run e2e:slow:all` separately when needed. To regression-test **every** bundled example with Run All, use `npm run e2e:examples` or `npm run e2e:examples:all` (see `docs/E2E_STAGING.md`).
Deploy artifacts with `npm run deploy:staging` (leader `PUT`/`POST` flow; see `scripts/deploy-staging.mjs` header) using env/CI secrets only.
Coverage and maintenance rules (when to update specs for new features): [`docs/E2E_STAGING.md`](./docs/E2E_STAGING.md).

Pyodide in this repo has intentional non-default behavior for sandboxed Cribl
deployments. Before touching worker/runtime upgrade paths, read
[`docs/PYODIDE_CUSTOMIZATIONS.md`](./docs/PYODIDE_CUSTOMIZATIONS.md).

## Git workflow (agents & humans)

- **Branch before implementing:** create a feature branch from the current `main` (or `origin/main`) before writing code or committing (`git checkout -b feature/...`). Do not stack feature work directly on `main`.
- **Integrate via PR:** merge completed work through a pull request into `main`, then keep local `main` aligned with `origin/main` after merge.

## Publishing to GitHub

Cribl apps live in one of two GitHub orgs (coordinate with ProdEng / Chris Breshears):
- Supported apps: `https://github.com/criblapps`
- Community apps: `https://github.com/Cribl-Community`

**License:** `LICENSE.TXT` (BSD-3, Cribl, Inc.) must be present at the repo root.

**Release checklist (before tagging):**
1. Prepend a block to `src/features/welcome/releaseNotes.ts` for the version.
2. Optionally bump `package.json` to the same version.
3. Merge to `main`.
4. Dry-run: `npm ci && npm run lint && npm run package -- --version X.Y.Z && ls build/*.tgz`
5. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`

**Install from Git (Cribl UI):** Apps → Install App → Import From Git. Set URL to the repo HTTPS URL and "Branch or tag" to the release tag (e.g. `v1.2.9`). Leaving the tag field blank causes the import to fail. Release CI publishes the same pack layout as the `.tgz` (`static/`, `default/proxies.yml`) onto the tag after build — wait for the Release workflow to finish before importing. Do **not** commit `static/` or `default/` on `main`; they are generated artifacts (see `.gitignore`).

**Install from file:** Download `notebook-app-X.Y.Z.tgz` from GitHub Releases (or `npm run package`) and use Import from File.

## Cribl platform integration

The app runs as a widget in a sandboxed Cribl iframe. The platform injects read-only
globals (`CRIBL_API_URL`, `CRIBL_BASE_PATH`, optional `getCriblUser`), transparently
authenticates and proxies every `fetch()` to `CRIBL_API_URL`, scopes a per-pack KV
store, and routes declared external domains through the pack proxy.

**All of this is documented in one canonical place:
[`docs/PLATFORM.md`](./docs/PLATFORM.md)** — globals, the fetch proxy + URL rewriting,
the KV store (including notebook-library key scoping), config-group context, the
`config/proxies.yml` schema with examples, React Router basename, and navigation sync.
Read it before adding a Cribl API call or an external dependency.

Essentials to keep in mind:

- Never handle auth in app code; `window.fetch` is locked and cannot be replaced.
- Search endpoints always use `groupId = default_search` (`/m/default_search/search/…`).
- Every external domain must be declared in `config/proxies.yml`; auth headers go
  through `headers.inject` (KV-backed), since the proxy strips sensitive request headers.
- REST endpoint definitions live in `openapi.json` at the repo root (if downloaded
  during setup); the Riptide agent contract is in [`docs/riptide-api.md`](./docs/riptide-api.md).

