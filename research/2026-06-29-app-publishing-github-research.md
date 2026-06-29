# Research: App Publishing to GitHub compliance

**Source:** `research/App Publishing to Github.pdf`  
**Date:** 2026-06-29

## High-level summary

The Cribl publishing guide defines three GitHub org tiers (product-private, `criblapps` supported, `Cribl-Community` community), requires a verbatim BSD-3 `LICENSE.TXT`, standard project layout (`src/`, `config/proxies.yml`, `AGENTS.md`), and a tag-driven `.github/workflows/release.yml` that lints, packages with version from the tag (`npm run package -- --version …`), and publishes `build/*.tgz` via `softprops/action-gh-release@v2` with `generate_release_notes: true` and `fail_on_unmatched_files: true`. This repo already has `AGENTS.md`, `config/proxies.yml`, and a release workflow, but lacks `LICENSE.TXT`, does not pass `--version` from the tag into packaging, omits `npm run lint` and `fail_on_unmatched_files`, uses a stricter tag pattern and custom release notes instead of GitHub auto-notes, and documents a release flow that requires pre-tag `package.json` bumps—contrary to the guide.

## Detailed findings

### Publishing guide requirements (`research/App Publishing to Github.pdf`)

| Area | Requirement |
|------|-------------|
| License | Verbatim BSD-3 text in `LICENSE.TXT`; GitHub repo "License" section |
| Release trigger | Push tags matching `v*` |
| Release job | `npm ci` → `npm run lint` → `npm run package -- --version "${GITHUB_REF_NAME#v}"` → `action-gh-release` with `files: build/*.tgz`, `generate_release_notes: true`, `fail_on_unmatched_files: true` |
| Versioning | Tag stamps artifact version at build time; no `package.json` bump required in a commit |
| Install from Git | Apps → Import From Git; branch/tag required (e.g. `v1.0.0`) |
| Layout | `src/`, `config/proxies.yml`, `AGENTS.md` |

### License

- No `LICENSE` or `LICENSE.TXT` in repo root (glob search returned 0 files).
- `package.json` has no `"license"` field (`package.json:1-80`).
- `pkgutil.mjs` copies `license` into pack `package.json` only when present on root `package.json` (`scripts/pkgutil.mjs:88-92`).

### Release workflow (current)

`.github/workflows/release.yml:1-51`:

- Name: `GitHub Release` (guide: `Release`).
- Tag filter: `v[0-9]+.[0-9]+.[0-9]+` (guide: `v*`).
- Steps: checkout → setup-node (with cache) → **verify tag matches `package.json`** → `npm ci` → `npm run package` (no lint, no `--version`) → custom `emit-github-release-notes.ts` → `action-gh-release` with `body_path`, `files: build/notebook-app-*.tgz`.
- Missing vs guide: `npm run lint`, `npm run package -- --version`, `generate_release_notes: true`, `fail_on_unmatched_files: true`, `files: build/*.tgz`.

### Packaging scripts

- `scripts/package.mjs:45-47` names artifact `${packageInfo.name}-${packageInfo.version}.tgz` from root `package.json` only; no CLI `--version` parsing.
- `scripts/pkgutil.mjs:84-102` embeds root `package.json` `version` into pack metadata; no override parameter on `createAppPack()`.

### Release notes (custom, in-app + GitHub)

- `src/features/welcome/releaseNotes.ts` — curated `RELEASE_NOTES` array; latest block version `1.2.9` matches `package.json`.
- `src/features/welcome/releaseNotes.test.ts:10-17` — test enforces `RELEASE_NOTES[0].version === package.json version`.
- `scripts/emit-github-release-notes.ts` + `releaseGithubMarkdown.ts` — CI writes `body_path` from `RELEASE_NOTES` for tagged version.
- `CLAUDE.md:28` documents: bump `package.json`, prepend `releaseNotes.ts`, tag `vX.Y.Z` matching `package.json` — conflicts with guide's tag-only versioning.

### Project layout (compliant)

- `src/` — feature-sliced app (`src/App.tsx`, providers, features).
- `config/proxies.yml` — external domain allowlist.
- `AGENTS.md` — platform developer guide (present at repo root).
- `README.md` — project overview (not required by guide).

### Other GitHub automation (informational)

- `.github/workflows/gitleaks.yml` — secret scan on PR/push to `main`.
- `.github/workflows/e2e-staging.yml` — staging E2E (`workflow_dispatch`).
- `.github/dependabot.yml` — dependency updates.

### Org placement (process, not code)

Guide: supported apps live in `https://github.com/criblapps`; community apps in `https://github.com/Cribl-Community`. Current remote org not verified in this research (no `git remote` run).
