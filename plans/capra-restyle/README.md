# Plan: Capra design system restyle

## Context
Restyle notebook-app to support Cribl’s Capra Design System so the app chrome and theming match the host Cribl UI, while preserving notebook-specific surfaces (cells, CodeMirror, MIME outputs).

## Requirements
- [ ] Capra packages installed from **public npmjs** and CSS loaded per [Using Capra](https://capra.cribl.io/?path=/docs/using-capra--docs)
- [ ] Theme mode is Capra light/dark only (`.dark` class); **all notebook palettes removed**
- [ ] App chrome uses Capra components where they fit (buttons, modals, fields, tags, menus, spinners)
- [ ] Notebook cell/editor surfaces remain functional and Capra-tokenized (light/dark syntax only)
- [ ] No auth/platform regressions; sandboxed iframe still works
- [ ] Tests + build pass; release note entry when shipped

## Research Summary
See `research/2026-07-19-capra-design-system-restyle-research.md` and proposals doc. Chosen approach: **Proposal 1 — Capra foundation + progressive chrome adoption**.

## Chosen Approach
Progressive adoption: Capra theme foundation first, then chrome components, then editor token alignment. **Delete the 10-palette system entirely** — no syntax-only palette picker and no third-party themes. Capra light/dark is the only product theme.

## Design

### Architecture
```
@capra/theme/base.css  (+ icons + core styles)
        ↓
ThemeProvider → documentElement.classList .dark | (light default)
        ↓
nb token bridge (token() or adapter) → notebook surfaces
        ↓
Capra components (chrome)  |  custom .nb-* layout (cells/editors)
```

### Key decisions (resolved)
1. **Theme = Capra light/dark only.** Remove `AppStyleId`, `NOTEBOOK_STYLES`, `data-nb-style`, `nb-palettes.css` multi-palette blocks, and the toolbar style `<select>`. Migrate storage once: `cribl-pro` / legacy `light` → light; `cribl-midnight` / legacy `dark` → dark; **any other palette id → light** (no luma-based palette retention).
2. **Editors:** one Capra-aligned light syntax set and one dark set, driven only by Capra mode — not selectable independently.
3. **npm registry:** install `@capra/*` from **public npmjs** (default registry). Do not add a private Cribl `@capra` registry to this repo’s `.npmrc` / CI.
4. **Do not use `@capra/domain`** initially (ProductsNavigation / AppsPopover are host-shell concerns).
5. **Notebook tabs/sidebar:** Capra-tokenized custom UI (or Menu/ListItem building blocks) over forcing URL-based `TabNav`.
6. **token() DX:** wire PostCSS plugin in Vite when practical; until then, a single `capra-nb-bridge.css` may map notebook tokens using Capra CSS vars as an explicit adapter exception.
7. **Fonts:** Capra package fonts; remove conflicting Google Fonts from `index.html`.

### Non-goals (this epic)
- Restyling Plotly/Vega figure colors inside MIME JSON
- Fully Capra-theming Jupyter widget controls CSS
- Adopting `@capra/antd4` (legacy Cribl path)
- Keeping or reintroducing Nord/Dracula/etc. (or any non-Capra) palettes

## Testing Plan
- Unit: ThemeProvider light/dark + migration from old palette keys; Dialog/Modal smoke
- Manual: welcome, sidebar CRUD dialogs, run/stop toolbar, light/dark toggle, CodeMirror both modes
- Build: `npm run lint && npm test && npm run build` (+ bundle size note); CI installs `@capra/*` from public registry
- Staging: `npm run e2e:quick` after chrome swaps that touch dialogs/toolbar

## Rollout
- Feature branch → PR slices (deps/theme → chrome → editors → cleanup)
- Release notes: Capra light/dark + chrome restyle; **removal of the visual-style palette picker**
- Rollback: revert PRs; localStorage migration is additive (old `nb-app-style` keys ignored after migrate)

## Open Questions
- [ ] Full `token()` DX in Vite day-one vs adapter bridge first? (implementation spike in task 01)
