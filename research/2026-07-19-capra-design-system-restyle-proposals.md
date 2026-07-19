# Solution Proposals: Capra design system restyle

Context:
- Request: Restyle notebook-app to support Capra Design System per https://capra.cribl.io/?path=/docs/getting-started--docs
- Research Source: `research/2026-07-19-capra-design-system-restyle-research.md`

## Proposal 1 — Capra foundation + progressive chrome adoption (recommended)

- Overview: Adopt `@capra/theme` (+ `@capra/icons`, `@capra/core`) as the visual foundation. Rework `ThemeProvider` to Capra light/dark via the `.dark` class. Bridge remaining notebook surfaces (`--nb-*` or successor tokens) onto Capra semantic tokens. Replace app chrome (buttons, dialogs, inputs, menus, tags, spinners, empty states) with Capra components over a few slices; keep cell/CodeMirror/MIME layout custom but Capra-tokenized.
- Key Changes:
  - Dependencies: `@capra/theme`, `@capra/core`, `@capra/icons`; Vite PostCSS token plugin (preferred) or adapter CSS bridge.
  - CSS entry: import Capra `base.css` + icons + core styles in `main.tsx` / root CSS; remove Google Fonts that conflict with Capra Open Sans / Source Code Pro.
  - Theme: `ThemeProvider` sets/clears `.dark` on `document.documentElement` (or body); migrate storage from 10 `AppStyleId`s to Capra light/dark only (no retained palettes); map `cribl-pro`→light, `cribl-midnight`→dark, all other palette ids→light.
  - Bridge: redefine notebook surface tokens from Capra `token()` keys (backgrounds, borders, accent, focus, semantic colors, typography/spacing where practical).
  - Components: DialogProvider/NotebookDialog → Capra `Modal`; Toolbar actions → `Button`/`IconButton`/`Menu`; tags → `Tag`/`Pill`; loading → `Spinner`; welcome empty → `EmptyState` where appropriate.
  - Editors: keep CodeMirror; Capra-aligned light/dark syntax sets only; **delete** all third-party / multi-palette themes (no syntax-only picker).
- Trade-offs:
  - Benefits: Matches Cribl product UI; real Capra support (tokens + components); better a11y via React Aria; long-term maintainability.
  - Risks: Larger bundle; multi-PR scope; TabNav may not fit notebook tabs; temporary dual CSS during migration; proprietary Capra license (acceptable for Cribl Apps).
- Validation: Unit tests for ThemeProvider mode + migration; visual smoke on welcome/sidebar/toolbar/dialogs; `npm run build` bundle size check; staging e2e smoke (`e2e:quick`) for regressions on dialogs/buttons.
- Open Questions: Full `token()` DX in Vite day-one vs adapter bridge first?
- Resolved decisions (2026-07-19): **CI registry = public npmjs**; **product = drop all palettes, Capra light/dark only**.

## Proposal 2 — Token-only visual alignment (no Capra components)

- Overview: Install only `@capra/theme`, import `base.css`, map `cribl-pro` / `cribl-midnight` (or all palettes’ Cribl variants) onto Capra light/dark CSS variables via a bridge in `nb-palettes.css`. Leave all React markup on `.nb-*` classes and custom dialogs/buttons.
- Key Changes:
  - Add `@capra/theme`; ThemeProvider toggles `.dark` for Capra midnight equivalent.
  - Remap `--nb-*` values to Capra semantics for the two Cribl palettes (optionally leave other palettes as-is or remove).
  - Swap fonts toward Open Sans / Source Code Pro.
  - No `@capra/core` component rewrites.
- Trade-offs:
  - Benefits: Smaller change surface, lower regression risk, faster first visual alignment.
  - Risks: Incomplete “Capra support” (docs emphasize components + tokens); chrome will still look custom; higher chance of drift; still pay most of theme CSS/font cost without component a11y wins.
- Validation: ThemeProvider tests; visual compare Capra Storybook Button/Modal vs notebook chrome (expect mismatch); build + unit tests.
- Open Questions: Is token-only enough for the product ask? If not, Proposal 1 is required anyway.

## Choice

**Choose Proposal 1.** The request is to support Capra as a design system (tokens + components per Getting Started / Using Capra), not only recolor the existing chrome. Proposal 2 is a valid interim milestone inside Proposal 1’s first slices, but not the end state.
