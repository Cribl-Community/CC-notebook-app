# Research: Capra design system restyle (notebook-app)

Date: 2026-07-19  
Request: Restyle the app to support Capra Design System ([Getting Started](https://capra.cribl.io/?path=/docs/getting-started--docs)).

## High-level summary

The notebook-app today has **no Capra (or other design-system) dependency**. Visual theming is a first-party **10-palette** system (`data-nb-style` + `--nb-*` CSS variables) owned by `ThemeProvider`, with ~2.8k lines of hand-written `.nb-*` layout CSS in `src/index.css` and palette tokens in `src/app/styles/nb-palettes.css`. Capra is Cribl’s design system (`@capra/*` on npm), documented at [capra.cribl.io](https://capra.cribl.io/) and [llms.txt](https://capra.cribl.io/llms.txt). Capra provides design tokens (`@capra/theme`), React components (`@capra/core`), icons (`@capra/icons`), and optional domain packages. Light is default on `:root`; dark mode is activated by a **`.dark` class**. Notebook-specific surfaces (cells, CodeMirror, MIME outputs) have no Capra equivalents and remain custom regardless of adoption depth.

## Capra design system (external)

### Docs & packages
- Storybook: https://capra.cribl.io/?path=/docs/getting-started--docs
- Install guidance ([Using Capra](https://capra.cribl.io/?path=/docs/using-capra--docs)): `npm install @capra/core @capra/domain @capra/theme` then import:
  - `@capra/theme/base.css` (preferred: tokens + fonts + baseline)
  - `@capra/icons/styles.css`
  - `@capra/core/styles.css`
- Token usage ([Design Tokens/Usage](https://capra.cribl.io/?path=/docs/foundation-design-tokens-usage--docs)): `token('spacing.md')` in CSS/TS; compile-time via macros / PostCSS (`@capra/dx-tokens-postcss-plugin`) or LightningCSS plugin. Docs instruct not to hand-author raw Capra CSS variable names in app source.
- Typography: Open Sans (UI) + Source Code Pro (code) — see foundation typography docs.
- Theming model (from `@capra/theme@1.3.1` `base.css`): semantic tokens as `--cds2-*` on `:root`; dark overrides under `.dark { … }`.
- Public npm versions observed (2026-07-19): `@capra/theme@1.3.1`, `@capra/core@1.8.2` (peers React ≥17; deps `react-aria`, `react-aria-components`, `@capra/icons`), `@capra/dx-tokens-postcss-plugin@0.3.2`.
- License: proprietary Packs Developer Agreement (Cribl account / Cribl platform use) — LICENSE.txt in packages.
- Cribl product UI (reference): `cribl-source/cribl` depends on `@capra/core`, `@capra/theme`, `@capra/icons`, `@capra/domain`, `@capra/antd4`; `.npmrc` points `@capra` at private `npm.build.cribl.io`, but packages also resolve from public npmjs for inspection.
- Dark mode in Cribl UI helper: `document.body.className = theme === 'dark' ? 'dark' : ''` (`uiHelpers.ts` `setTheme`).

### Capra components relevant to this app
From `@capra/core` exports / Storybook: `Button`, `IconButton`, `Modal`, `Drawer`, `TextField`, `TextArea`, `Menu`, `Popover`, `Tag`, `Pill`, `Alert`, `Spinner`, `Toast`, `EmptyState`, `TabNav`, `VerticalNavigation`, `Breadcrumbs`, `Card`, `Text`, `Link`, `Divider`, `Switch`, `Checkbox`, etc.

**Fit caveats (as of docs):**
- `TabNav` is documented as URL/link navigation — notebook tabs are in-app state (not routes). May need Capra-styled custom tabs or careful composition rather than drop-in `TabNav`.
- No Capra primitives for Jupyter cells, CodeMirror, Plotly/Vega MIME, or widget chrome.

## Current notebook-app theming (live code)

### Entry & ownership
- `index.html`: initial `data-nb-style="cribl-pro"`; Google Fonts (Inter, Plus Jakarta Sans, Space Grotesk, Source Sans 3).
- `src/main.tsx`: imports `index.css`, `nb-palettes.css`, Jupyter widgets CSS.
- `src/app/providers/ThemeProvider.tsx`: persists `nb-app-style` in `localStorage`; sets `document.documentElement.dataset.nbStyle`; exposes `appStyle`, `setAppStyle`, `codeMirrorLuma`, `cycleAppStyle`.
- `src/app/styles/nbStyles.ts`: 10 `AppStyleId`s; default `cribl-pro`; CodeMirror luma per style; legacy `nb-theme` migration.
- `src/app/styles/nb-palettes.css`: per-palette `--nb-*` token blocks (~660 lines).
- `src/index.css`: structure/layout + all `.nb-*` component rules (~2860 lines); `:root` spacing `--space-1`…`--space-8`, fluid `--nb-text-ui-*`.
- Toolbar style `<select className="nb-style-select">` in `Toolbar.tsx` (welcome + notebook).

### Token surface (`--nb-*`)
Surfaces, text, borders, accent/brand, focus, semantic success/warn/error, links, markdown accent, CodeMirror Python (`--nb-cm-*`) and KQL (`--nb-cm-kql-*`) syntax colors, elevation shadows, UI font.

### UI styling pattern
- Almost exclusively `className="nb-…"`; no Tailwind/Emotion/CSS Modules/Capra.
- Dialogs: `NotebookDialog` + `DialogProvider` → `.nb-dialog-*`.
- Sidebar: `NotebookSidebar` → `.nb-sidebar*`.
- Editors: CodeMirror theme in `src/ui/editor/pythonCodeMirror.ts` consumes CSS vars + luma flag.
- Tests: `ThemeProvider.test.tsx` asserts `dataset.nbStyle`.

### Platform constraints
- Sandboxed Cribl iframe (`docs/PLATFORM.md`): no fetch override; external domains need `config/proxies.yml`. Capra CSS/fonts ship from the app bundle (no proxy needed if fonts are packaged in `@capra/theme`).
- App is a Cribl App (`.tgz`) — Capra Packs license aligns with platform use.

### Gaps vs Capra
- No `@capra/*` in `package.json`.
- Theme model is multi-palette `data-nb-style`, not Capra `.dark`.
- Fonts differ (Google Inter family vs Capra Open Sans / Source Code Pro).
- Spacing/type scales are local (`--space-*`, clamp UI type) vs Capra `spacing.*` / `typography.*`.
- Chrome controls (buttons, dialogs, selects) are custom, not Capra components.

## Impacted areas (file map)

| Area | Paths |
|------|--------|
| Theme state | `src/app/providers/ThemeProvider.tsx`, `src/app/styles/nbStyles.ts`, `ThemeProvider.test.tsx` |
| Tokens / CSS | `src/app/styles/nb-palettes.css`, `src/index.css`, `src/main.tsx`, `index.html` |
| Chrome UI | `Toolbar.tsx`, `NotebookTabs.tsx`, `NotebookDialog.tsx`, `DialogProvider.tsx`, `NotebookSidebar.tsx`, `WelcomePage.tsx`, `TagMultiFilter.tsx` |
| Editors | `pythonCodeMirror.ts`, `CodeCell.tsx`, KQL highlight CSS |
| Build | `package.json`, `vite.config.ts` (token PostCSS if adopted) |
| Docs / notes | `docs/ARCHITECTURE.md`, `releaseNotes.ts` |

## Constraints & unknowns

### Resolved (2026-07-19)
1. **Registry for CI:** **public npmjs** — do not configure a private Cribl `@capra` registry for this app.
2. **Palettes:** **drop entirely** — Capra light/dark only; no third-party palettes and no syntax-only palette picker.

### Remaining
3. **`token()` tooling:** Full Capra DX needs PostCSS/LightningCSS plugin + Vite wiring; alternative is a thin adapter layer (bridge CSS) accepting raw `--cds2-*` only inside that adapter.
4. **TabNav/VerticalNavigation fit** for notebook tabs/sidebar may be partial.
5. **Bundle size:** `@capra/theme` ~1.1MB packed (fonts + CSS); `@capra/core` adds React Aria + component CSS — measure after install.
6. **Jupyter widgets CSS** remains third-party and will not fully Capra-align without separate work.
