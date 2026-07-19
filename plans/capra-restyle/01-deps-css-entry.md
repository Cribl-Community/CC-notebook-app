# Task: Dependencies & Capra CSS entry

## Goal
Install Capra packages from **public npmjs** and load Capra CSS/fonts as the baseline stylesheet.

## Affected
- `package.json`, lockfile
- `src/main.tsx`, `src/index.css`, `index.html`
- optionally `vite.config.ts` / `postcss.config.*` for `token()`
- Do **not** add private Cribl `@capra` registry to `.npmrc`

## Work
1. Add `@capra/theme`, `@capra/core`, `@capra/icons` from the default public registry (pin versions; prefer current stable from npmjs).
2. Import `@capra/theme/base.css`, `@capra/icons/styles.css`, `@capra/core/styles.css` before app CSS.
3. Remove conflicting Google Fonts links from `index.html` (Capra ships Open Sans / Source Code Pro).
4. Spike Vite + `@capra/dx-tokens-postcss-plugin` OR document adapter-bridge exception for first PR.
5. Verify `npm ci` / GitHub Actions resolve `@capra/*` without a private registry.

## Acceptance
- [ ] Dev server loads without CSS 404s; Capra fonts apply to a smoke element
- [ ] `npm run build` succeeds with public registry only
- [ ] Bundle includes Capra CSS; no duplicate base/fonts/styles import
