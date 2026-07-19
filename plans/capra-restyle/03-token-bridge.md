# Task: Notebook token bridge to Capra

## Goal
Drive notebook surfaces from Capra semantic tokens so `.nb-*` layout CSS looks Capra-aligned in light and dark. **Delete multi-palette CSS** — no `data-nb-style` blocks remain.

## Affected
- `src/app/styles/nb-palettes.css` (delete or replace with a single Capra bridge file)
- `src/index.css` (`:root` spacing/type where overlapping)
- new bridge file under `src/app/styles/` (e.g. `capra-nb-bridge.css`)
- `src/main.tsx` import path

## Work
1. Map `--nb-bg`, text, border, accent, focus, semantic, link, shadow tokens to Capra equivalents via `token()` or adapter.
2. Align UI font/mono stacks with Capra typography tokens.
3. Prefer Capra spacing tokens for new/edited rules; avoid wholesale rewrite of every px literal in one PR.
4. **Remove** all `[data-nb-style="…"]` palette blocks and stop importing multi-palette CSS.

## Acceptance
- [ ] Welcome + notebook shell readable in light and dark with Capra teal/neutrals
- [ ] No missing critical tokens (inputs, errors, focus rings)
- [ ] No remaining palette stylesheet or `data-nb-style` selectors
- [ ] Visual spot-check against Capra Storybook surfaces
