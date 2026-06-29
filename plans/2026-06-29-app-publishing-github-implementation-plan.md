# Implementation plan: GitHub app publishing compliance

**Research:** `research/2026-06-29-app-publishing-github-research.md`
**Reviewed:** 2026-06-29 (compliance review vs PDF + Composer 2.5 feasibility)
**Chosen proposal:** Compliant release pipeline with curated release notes (no deviations from PDF)

## Context

Align `notebook-app` with Cribl's "App Publishing to Github" guide while preserving curated in-app/GitHub release notes and existing quality gates (pinned action SHAs, example size checks in `package.mjs`).

`body_path` and `generate_release_notes: true` are **not mutually exclusive** in `softprops/action-gh-release@v2` — curated notes from `body_path` are prepended to auto-generated notes when both are set. This makes full PDF compliance possible without dropping the curated release notes.

## Requirements

- [ ] Add verbatim BSD-3 `LICENSE.TXT` at repo root and `"license": "BSD-3-Clause"` in `package.json`.
- [ ] `npm run package -- --version X.Y.Z` stamps pack metadata and `.tgz` filename from the tag; no `package.json` mutation.
- [ ] Release workflow: lint → package from tag → publish `build/*.tgz` with `generate_release_notes: true` + `body_path` + `fail_on_unmatched_files: true`.
- [ ] Release docs (`CLAUDE.md`, `AGENTS.md`) match tag-driven flow.
- [ ] No test file changes required.

## Sub-tasks

### 1. Add `LICENSE.TXT` and `package.json` license field

**Files:** `LICENSE.TXT` (new), `package.json`

- Create `LICENSE.TXT` at the repo root with the verbatim BSD-3 text from the guide:

```
BSD 3-Clause License
Copyright © 2026, Cribl, Inc.
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its contributors
   may be used to endorse or promote products derived from this software
   without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

- Add `"license": "BSD-3-Clause"` to `package.json`. This flows into the packed `package.json` automatically via `scripts/pkgutil.mjs:88-92` (the `license` key is already in the allow-list there).

**Acceptance:** `LICENSE.TXT` exists at repo root; `package.json` has `"license": "BSD-3-Clause"`; `npm test` still passes.

---

### 2. Tag-driven version in packaging scripts

**Files:** `scripts/package.mjs` (lines 44-47), `scripts/pkgutil.mjs` (signature of `createAppPack` and lines 84-102)

#### `scripts/package.mjs`

After the existing imports (before line 44), parse an optional `--version <semver>` argument that npm forwards after `--`:

```js
// parse optional --version <semver> passed via: npm run package -- --version 1.2.3
const versionArgIdx = process.argv.indexOf('--version');
const versionOverride = versionArgIdx !== -1 ? process.argv[versionArgIdx + 1] : undefined;
```

Replace the `.tgz` name derivation (currently line 46, reads `packageInfo.version`) to use the override when present:

```js
const resolvedVersion = versionOverride ?? packageInfo.version ?? '0.0.0';
const tgzName = `${packageInfo.name || 'app'}-${resolvedVersion}.tgz`;
```

Pass `versionOverride` to `createAppPack`:

```js
const { closePromise, stdout } = await createAppPack(false, versionOverride);
```

#### `scripts/pkgutil.mjs`

Change the `createAppPack` signature to accept an optional second parameter:

```js
export async function createAppPack(dev = false, versionOverride = undefined) {
```

After `packageInfo` is built from root `package.json` (after line 92, before `writeFile`), override the version when provided:

```js
if (versionOverride) {
  packageInfo.version = versionOverride;
}
```

No other callers of `createAppPack` pass a second argument, so existing local dev and `servePackageTgz` behaviour is unchanged.

**Acceptance:** `npm run package -- --version 9.9.9` produces `build/notebook-app-9.9.9.tgz`; the `package.json` inside the archive has `"version": "9.9.9"`; root `package.json` is unchanged; `npm run package` (no `--version`) still uses the version from root `package.json`.

---

### 3. Align `.github/workflows/release.yml` with guide

**File:** `.github/workflows/release.yml`

Replace the entire file content. Keep existing pinned action SHAs (more secure than the guide's unpinned `@v4`/`@v2`); keep `node-version: '22'` and `cache: npm`; keep `body_path` for curated notes. Every other requirement matches the PDF exactly.

Key changes vs current file:

| Current | New |
|---------|-----|
| `name: GitHub Release` | `name: Release` |
| `jobs: publish:` | `jobs: release:` |
| tag filter `v[0-9]+.[0-9]+.[0-9]+` | `v*` |
| verify tag ≠ `package.json` step | **removed** |
| no `npm run lint` step | add `- run: npm run lint` |
| `npm run package` (no version) | `npm run package -- --version "${GITHUB_REF_NAME#v}"` |
| `files: build/notebook-app-*.tgz` | `files: build/*.tgz` |
| no `generate_release_notes` | add `generate_release_notes: true` |
| no `fail_on_unmatched_files` | add `fail_on_unmatched_files: true` |

Full target workflow (preserve existing pinned SHAs):

```yaml
# Publishes a GitHub Release when a tag matching v* is pushed (e.g. v1.2.3).
# Version is stamped from the tag — no package.json bump required.

name: Release

on:
  push:
    tags:
      - 'v*'

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4.3.1

      - uses: actions/setup-node@v4.4.0
        with:
          node-version: '22'
          cache: npm

      - run: npm ci

      - run: npm run lint

      - run: npm run package -- --version "${GITHUB_REF_NAME#v}"

      - name: Write GitHub release notes
        run: node --experimental-strip-types scripts/emit-github-release-notes.ts "${GITHUB_REF_NAME#v}" > gh-release-notes.md

      - name: Create GitHub Release with .tgz
        uses: softprops/action-gh-release@v2.3.2
        with:
          tag_name: ${{ github.ref_name }}
          name: Jupyter notebook app ${{ github.ref_name }}
          body_path: gh-release-notes.md
          generate_release_notes: true
          files: build/*.tgz
          fail_on_unmatched_files: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

Note on `generate_release_notes: true` + `body_path`: the curated notes from `body_path` are prepended to GitHub's auto-generated notes (commits since last tag). Both fields are supported simultaneously by `softprops/action-gh-release@v2`.

**Acceptance:** Workflow file passes `act` dry-run or `yamllint`. Dry-run locally: `npm ci && npm run lint && npm run package -- --version 1.0.0 && ls build/*.tgz`.

---

### 4. Documentation and release checklist

**Files:** `CLAUDE.md`, `AGENTS.md`

#### `CLAUDE.md` — replace the existing "GitHub Releases" bullet

Current (line ~28): "Bump `package.json`, prepend an entry in `src/features/welcome/releaseNotes.ts` … merge to the default branch, then create and push a tag `vX.Y.Z` **that matches that version**."

Replace with tag-driven flow:

> **GitHub Releases:** Prepend an entry to `src/features/welcome/releaseNotes.ts` (newest first) for the version you are about to release. Optionally bump `package.json` to the same version (keeps the in-app welcome screen current; not required by CI). Merge to `main`, then push a tag: `git tag vX.Y.Z && git push origin vX.Y.Z`. The tag triggers `.github/workflows/release.yml`, which lints, packages at the tag's version (leading `v` stripped), uploads `build/*.tgz`, and sets the release description from the curated notes prepended to GitHub's auto-generated commit list. Pre-tag dry-run: `npm ci && npm run lint && npm run package -- --version X.Y.Z && ls build/*.tgz`.

#### `AGENTS.md` — add a "Publishing to GitHub" section

Add after the "Git workflow" section:

> **Publishing to GitHub**
>
> Cribl apps live in one of two GitHub orgs (coordinate with ProdEng / Chris Breshears):
> - Supported apps: `https://github.com/criblapps`
> - Community apps: `https://github.com/Cribl-Community`
>
> **License:** `LICENSE.TXT` (BSD-3, Cribl, Inc.) must be present at the repo root.
>
> **Release checklist (before tagging):**
> 1. Prepend a block to `src/features/welcome/releaseNotes.ts` for the version.
> 2. Optionally bump `package.json` to the same version.
> 3. Merge to `main`.
> 4. Dry-run: `npm ci && npm run lint && npm run package -- --version X.Y.Z && ls build/*.tgz`
> 5. Tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`
>
> **Install from Git (Cribl UI):** Apps → Install App → Import From Git. Set URL to the repo HTTPS URL and "Branch or tag" to the release tag (e.g. `v1.2.9`). Leaving the tag field blank causes the import to fail.

**Acceptance:** Docs match the workflow; no references to "tag must match `package.json`" remain.

---

### 5. Manual verification checklist (pre-first compliant release)

- `npm ci && npm run lint && npm test` — all pass
- `npm run package -- --version 9.9.9` — `build/notebook-app-9.9.9.tgz` produced; `tar -O -xf build/notebook-app-9.9.9.tgz ./package.json | grep version` shows `9.9.9`; root `package.json` unchanged
- `npm run package` (no override) — produces `build/notebook-app-1.2.9.tgz` (current version) as before
- `npm run release:github-notes -- 1.2.9` — prints markdown without error
- Confirm `LICENSE.TXT` present and GitHub repo "License" section shows BSD-3 after merge
- After merge: `git tag v1.2.9 && git push origin v1.2.9` (or next version); confirm Actions run succeeds and release asset is attached

---

## Rollout

- All changes land on `main` via a single PR before the first compliant tag.
- No historical tag migration required.
- No test file changes — `releaseNotes.test.ts` stays as-is; teams keep bumping `package.json` alongside `releaseNotes.ts` as dev hygiene (the workflow no longer gates on it, but the test still validates it as a useful invariant).

## Open questions (resolve before implementation)

1. **Target GitHub org:** `criblapps` (supported, ProdEng-maintained) vs `Cribl-Community` (community) — confirm with ProdEng / Chris Breshears.
2. **Tag pattern:** `v*` is required by the PDF. The previous strict semver filter `v[0-9]+.[0-9]+.[0-9]+` is kept as an acceptable team variant if documented; `v*` is the default in this plan.
