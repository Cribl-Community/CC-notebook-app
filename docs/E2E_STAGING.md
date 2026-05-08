# Staging end-to-end testing (Playwright)

This app ships as a Cribl App Platform `.tgz` and runs inside a **parent** UI with an **iframe**. Vitest + JSDOM (`npm test`) covers units and a stubbed App smoke test; Playwright drives a **real tenant** for regression, timing budgets, and feature-specific checks.

## Prerequisites

1. Node 22+ (aligned with CI).
2. One-time browser install: `npm run e2e:install`.
3. Copy `e2e/.env.example` → `e2e/.env` (the file is gitignored). Set at least:
   - `CRIBL_E2E_BASE_URL` — staging origin, e.g. `https://your-org.cribl-staging.cloud`
   - `CRIBL_E2E_START_PATH` — `/apps` is fine: after login the harness clicks the installed **Jupyter notebook app** row (link href contains `notebook-app` by default).
   - Optional `CRIBL_E2E_APP_PACK_PATH` — e.g. `/apps/a/notebook-app-1-0-68-tgz` to skip the catalog when you want a fixed URL after version bumps.

Never commit `e2e/.env`, tokens, or `e2e/.auth/storageState.json`.

## Auth (human login once)

Run a **headed** browser, sign in to staging, then save cookies/local storage to disk:

```bash
npm run e2e:auth
```

- Default flow: after the Apps page loads, complete SSO/login in the window, then either press **Enter** in the terminal or run **`touch e2e/.auth/login-complete`** in another shell. Enter sometimes fails because npm/Playwright do not attach the real TTY to `stdin`; reading from `/dev/tty` fixes that on macOS/Linux—if it still stalls, use the `touch` fallback.
- Optional unattended capture: set `CRIBL_E2E_POST_LOGIN_SELECTOR` in `e2e/.env` to a CSS selector that appears only after login.

CI should use the same JSON produced locally, stored as a **base64-encoded secret** (see `.github/workflows/e2e-staging.yml`), never checked into Git.

## Running tests

```bash
npm run e2e
```

Skip the slow Pyodide kernel assertion (~3 min cap):

```bash
npm run e2e:quick
```

### What the specs cover

| Area | File | Tags |
|------|------|------|
| Shell mount / chrome | `e2e/specs/smoke.spec.ts` | `@smoke`, `@regression` |
| Time-to-visible shell | `e2e/specs/performance.spec.ts` | `@performance` |
| Welcome, examples, new tab, toolbar, editor, kernel ready | `e2e/specs/workflows.spec.ts` | `@regression`, `@slow` on kernel test |

Main flows exercised: **Apps catalog → widget iframe**, **Welcome hero & sidebar**, **Open example** (new tab), **New notebook** (Untitled tab, CodeMirror, Run All), **kernel Ready** (Pyodide).

### Keeping E2E current (features & refactors)

When you change **user-visible behavior** (welcome copy, tab rules, toolbar labels, example flow, kernel lifecycle, saved-notebook UX), treat Playwright like unit tests:

1. Update or add specs under `e2e/specs/` in the same PR when behavior changes (or file a follow-up issue if staging-only verification must wait).
2. Prefer **stable selectors**: roles and labels (`getByRole`, `aria-label`), existing classes (`.nb-toolbar`), or `data-testid` on stable shells — avoid brittle CSS chains.
3. Tag focused suites with `@smoke` (minimal CI subset), `@regression` (full staging suite), or `@slow` (Pyodide-heavy); filter with `--grep` / `--grep-invert`.
4. Run `npm run e2e:quick` before merge when full kernel coverage is unnecessary; run full `npm run e2e` for release or risky kernel/editor changes.

See also [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) (Testing + feature recipe).

Reports and traces land under `playwright-report/` and `test-results/` (gitignored).

Open the last HTML report: `npm run e2e:report` (or `npx playwright show-report`).

Selectors resolve the notebook shell by scanning **all frames** for `.nb-app-frame` or
`data-testid="notebook-app-root"` so tenants whose iframe `src` does not contain `app-ui`,
or builds without the test id, still work.

## Packaging and deploy

Build and produce the archive:

```bash
npm run package
```

Upload to your tenant using **environment or CI secrets only**:

| Variable | Purpose |
|----------|---------|
| `CRIBL_DEPLOY_URL` | Full HTTPS URL for the upload request (from your platform/OpenAPI docs) |
| `CRIBL_API_TOKEN` | Bearer token |
| `PACKAGE_TGZ` | Optional path; defaults to newest `*.tgz` under `build/` |
| `CRIBL_DEPLOY_FORM_FIELD` | Optional multipart field name (default `package`) |

```bash
npm run deploy:staging
```

Dry-run (resolve package path only): `CRIBL_DEPLOY_DRY_RUN=1 npm run deploy:staging`

Combined: `npm run e2e:package-and-deploy`

## Chrome DevTools MCP (optional)

For deep performance investigation (CPU trace, Lighthouse) on the same staging URLs, use the **user-chrome-devtools** MCP in Cursor — e.g. `performance_start_trace` / `performance_stop_trace`, `lighthouse_audit`. Treat exported traces like secrets if they contain session cookies; do not commit them.

## GitHub Actions

Workflow: **Staging E2E** (`workflow_dispatch`). Required secrets:

- `CRIBL_E2E_BASE_URL`
- `CRIBL_E2E_STORAGE_STATE_B64` — `base64 -i e2e/.auth/storageState.json | pbcopy` (macOS) or equivalent

Optional repository variables: `CRIBL_E2E_START_PATH`, `CRIBL_E2E_START_URL`, `CRIBL_E2E_PERF_SHELL_MS`, `CRIBL_E2E_POST_LOGIN_SELECTOR`.
