# Staging end-to-end testing (Playwright)

This app ships as a Cribl App Platform `.tgz` and runs inside a **parent** UI with an **iframe**. Vitest + JSDOM (`npm test`) covers units and a stubbed App smoke test; Playwright drives a **real tenant** for regression, timing budgets, and feature-specific checks.

## Prerequisites

1. Node 22+ (aligned with CI).
2. One-time browser install: `npm run e2e:install`.
3. Copy `e2e/.env.example` → `e2e/.env` (the file is gitignored). Set at least:
   - `CRIBL_E2E_BASE_URL` — staging origin, e.g. `https://your-org.cribl-staging.cloud`
   - `CRIBL_E2E_START_PATH` — `/apps` is fine: after login the harness clicks the installed **Jupyter notebook app** row (link href contains `notebook-app` by default).
   - Optional `CRIBL_E2E_APP_PACK_PATH` — e.g. `/apps/a/notebook-app-1-0-68-tgz` to skip the catalog when you want a fixed URL after version bumps.

Never commit `e2e/.env`, tokens, `e2e/.auth/storageState.json`, or `e2e/.auth/captured-credentials.env`.

## Auth (human login once)

Run a **headed** browser, sign in to staging, then save cookies/local storage to disk:

```bash
npm run e2e:auth
```

- Default flow: after the Apps page loads, complete SSO/login in the window, then either press **Enter** in the terminal or run **`touch e2e/.auth/login-complete`** in another shell. Enter sometimes fails because npm/Playwright do not attach the real TTY to `stdin`; reading from `/dev/tty` fixes that on macOS/Linux—if it still stalls, use the `touch` fallback.
- Optional unattended capture: set `CRIBL_E2E_POST_LOGIN_SELECTOR` in `e2e/.env` to a CSS selector that appears only after login.
- **Deploy token:** the setup records the same **`Authorization: Bearer`** JWT the UI sends on leader **`/api/v1/*`** requests into **`e2e/.auth/captured-credentials.env`** (gitignored). `npm run deploy:staging` loads it automatically unless **`CRIBL_API_TOKEN`** is set in **`e2e/.env`** (manual value wins).

CI should use the same JSON produced locally, stored as a **base64-encoded secret** (see `.github/workflows/e2e-staging.yml`), never checked into Git.

## Running tests

```bash
npm run e2e
```

Full regression runs in **two phases**: `e2e:quick` (Playwright `--grep-invert '@slow|@examples-all'`, **parallel** with multiple workers) then `e2e:slow` (**one worker**, **`@heavy` excluded** so pack-proxy–heavy notebooks do not run immediately after other Pyodide specs). Use **`npm run e2e:slow:all`** to include `@heavy` (Anomaly PyOD Run All).

Skip the slow Pyodide-heavy specs entirely (~multi-minute):

```bash
npm run e2e:quick
```

Run only `@slow` specs (single worker), excluding `@heavy`:

```bash
npm run e2e:slow
```

Run **all** `@slow` specs including `@heavy`:

```bash
npm run e2e:slow:all
```

Run **every** bundled example from `public/Examples/manifest.json` (manifest-driven **Run All**, single worker; long wall-clock):

```bash
npm run e2e:examples       # all except @heavy (Anomaly PyOD)
npm run e2e:examples:all    # includes Anomaly PyOD
```

Run **`@examples-all` from “Cribl Search Examples” onward** in manifest order (same sort as `all-example-notebooks.spec.ts`: `recommendedOrder`, then filename). Omits notebooks earlier in the list (e.g. Getting Started, Incident Triage) and omits `@heavy` Anomaly PyOD:

```bash
npm run e2e:examples:from-cribl-search
```

### Parallelism and host load

| Variable | Purpose |
|----------|---------|
| `CRIBL_E2E_WORKERS` | Worker count for `e2e:quick` (and any direct `playwright test` without `--workers`). Integer ≥ 1, or a Playwright percentage such as `50%`. **Default: 2** if unset. |

The `@slow` phase always uses **`--workers=1`** via `npm run e2e:slow`. GitHub Actions sets **`CRIBL_E2E_WORKERS=4`** only for the quick phase so the runner stays within typical `ubuntu-latest` capacity while shortening wall-clock time.

If the machine struggles (memory, CPU fans), set `CRIBL_E2E_WORKERS=1` in `e2e/.env` or the environment before `e2e:quick`.

### What the specs cover

| Area | File | Tags |
|------|------|------|
| Shell mount / chrome | `e2e/specs/smoke.spec.ts` | `@smoke`, `@regression` |
| Time-to-visible shell | `e2e/specs/performance.spec.ts` | `@performance` |
| Welcome, examples, new tab, toolbar, editor | `e2e/specs/workflows.spec.ts` | `@regression` |
| Pyodide kernel Ready (new notebook tab) | `e2e/specs/kernel-ready.spec.ts` | `@regression`, `@slow` |
| Jupyter-style `%pip` / `!pip` line rewrite (stderr hint, no PyPI) | `e2e/specs/pip-magic.spec.ts` | `@regression`, `@slow` |
| Visualisations bundled notebook: Run All (micropip Plotly, charts) | `e2e/specs/visualisations-example.spec.ts` | `@regression`, `@slow` |
| Cribl Search Lookup Magics notebook: Run All (lookup magics, `$vt_lookups`, `%%cribl_api` REST) | `e2e/specs/cribl-search-lookup-magics.spec.ts` | `@regression`, `@slow` |
| Process Lineage Sigma Hunt notebook: Run All (`externaldata`, networkx lineage kill-chain, rarity charts) | `e2e/specs/process-lineage-sigma-hunt-example.spec.ts` | `@regression`, `@slow` |
| Anomaly Detection PyOD notebook: Run All (micropip PyOD stack, `%%cribl_search`, Plotly) | `e2e/specs/zz-anomaly-detection-example.spec.ts` | `@regression`, `@slow`, `@heavy` (opt-in via `npm run e2e:slow:all`) |
| All bundled examples: Run All per `manifest.json` (opt-in matrix) | `e2e/specs/all-example-notebooks.spec.ts` | `@examples-all`; Anomaly also `@heavy` — `npm run e2e:examples` / `e2e:examples:all` |

Main flows exercised: **Apps catalog → widget iframe**, **Welcome hero & sidebar**, **Open example** (new tab), **New notebook** (Untitled tab, CodeMirror, Run All), **kernel Ready** (Pyodide), **`%pip` / `!pip` preprocessing** (unsupported subcommands → stderr), **Visualisations example Run All** (requires deployed `.tgz` that bundles the matching `Visualisations.ipynb` + kernel), **Cribl Search Lookup Magics Run All** (Search + lookup APIs + `Cribl_Search_Lookup_Magics.ipynb`), **Process Lineage Sigma Hunt example Run All** (Search `externaldata` + `Process_Lineage_Sigma_Hunt.ipynb`; traces process lineage into a networkx kill-chain and rarity charts), **Anomaly Detection PyOD example Run All** (needs **Cribl Search** for `%%cribl_search` / `externaldata` and a `.tgz` that bundles `Anomaly_Detection_PyOD.ipynb`; cold micropip can be very slow). Optionally **`npm run e2e:examples`** runs **Run All** on every entry in `public/Examples/manifest.json` (overlaps those three focused specs when you run it).

### Keeping E2E current (features & refactors)

When you change **user-visible behavior** (welcome copy, tab rules, toolbar labels, example flow, kernel lifecycle, saved-notebook UX), treat Playwright like unit tests:

1. Update or add specs under `e2e/specs/` in the same PR when behavior changes (or file a follow-up issue if staging-only verification must wait).
2. Prefer **stable selectors**: roles and labels (`getByRole`, `aria-label`), existing classes (`.nb-toolbar`), or `data-testid` on stable shells — avoid brittle CSS chains.
3. Tag focused suites with `@smoke` (minimal CI subset), `@regression` (full staging suite), `@slow` (Pyodide-heavy), or `@examples-all` (opt-in full example matrix); filter with `--grep` / `--grep-invert`.
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

Upload to your tenant using **environment or CI secrets only**. The deploy script mirrors the Apps UI: **PUT** raw `.tgz` as `application/gzip` to `/api/v1/apps?filename=…`, then **POST** `/api/v1/apps/preinstall-check`, then **POST** `/api/v1/apps`. If registration conflicts with an existing pack id, it **DELETE**s `/api/v1/apps/{id}` and retries once (disable with `CRIBL_DEPLOY_NO_CONFLICT_RETRY=1`).

| Variable | Purpose |
|----------|---------|
| `CRIBL_API_TOKEN` | Bearer token accepted by the workspace leader API |
| `CRIBL_DEPLOY_BASE_URL` or `CRIBL_E2E_BASE_URL` | Leader origin only (no `/apps` path), e.g. `https://appplat-….cribl-staging.cloud` |
| `CRIBL_DEPLOY_URL` | Optional legacy helper: only **origin** is used if base vars are unset |
| `PACKAGE_TGZ` | Optional path; defaults to newest `*.tgz` under `build/` |
| `CRIBL_DEPLOY_PACK_ID` | Optional override for install pack id (default from `package.json`) |

```bash
npm run deploy:staging
```

Dry-run (resolve package path only): `CRIBL_DEPLOY_DRY_RUN=1 npm run deploy:staging`

Combined: `npm run e2e:package-and-deploy`

## Chrome DevTools MCP (optional)

For deep performance investigation (CPU trace, Lighthouse) on the same staging URLs, use the **user-chrome-devtools** MCP in Cursor — e.g. `performance_start_trace` / `performance_stop_trace`, `lighthouse_audit`. Treat exported traces like secrets if they contain session cookies; do not commit them.

## GitHub Actions

PRs and pushes to `main` run **Secret scan** (Gitleaks) on full history. Repository admins should also turn on **Secret scanning** and **Push protection** under *Settings → Code security* so GitHub blocks accidental token pushes before they land.

For **public** repos, under *Settings → Actions → General* → **Fork pull request workflows from outside collaborators**, choose an option that **requires approval** before workflows from fork PRs run, then **Save**. See GitHub’s [Managing GitHub Actions settings for a repository](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository).

If you ever **rewrote Git history** (for example to drop large `build/*.tgz` blobs), delete or update stale **remote branches** that still point at pre-rewrite SHAs; otherwise clones of those branches can resurrect old objects.

Workflow: **Staging E2E** (`workflow_dispatch`). Required secrets:

- `CRIBL_E2E_BASE_URL`
- `CRIBL_E2E_STORAGE_STATE_B64` — `base64 -i e2e/.auth/storageState.json | pbcopy` (macOS) or equivalent

Optional repository variables: `CRIBL_E2E_START_PATH`, `CRIBL_E2E_START_URL`, `CRIBL_E2E_PERF_SHELL_MS`, `CRIBL_E2E_POST_LOGIN_SELECTOR`, `CRIBL_E2E_WORKERS` (quick phase only; defaults to **`4`** in the workflow if unset).

The workflow runs **`npm run e2e:quick`** (parallel, respects `CRIBL_E2E_WORKERS`) then **`npm run e2e:slow`** (single worker). See [Running tests](#running-tests).
