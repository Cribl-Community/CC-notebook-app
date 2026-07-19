# Task: Cleanup, docs, release notes

## Goal
Remove dead palette/theme APIs; document Capra-only theming; note palette removal in release notes.

## Affected
- Dead `.nb-btn` / dialog / style-select CSS if unused
- `docs/ARCHITECTURE.md` ThemeProvider section
- `src/features/welcome/releaseNotes.ts`
- e2e selectors for the removed style picker / new light-dark control
- any remaining `nbStyles` / `nb-palettes` references

## Work
1. Delete unused palette IDs, `nb-palettes.css` (if not already gone), Google font preconnects, orphan CSS, `nb-style-select` rules.
2. Update architecture docs: Capra packages, `.dark`, light/dark only — no multi-palette system.
3. Prepend release notes: Capra restyle **and removal of the visual-style palette picker**.
4. Update e2e if toolbar control selectors changed.
5. Confirm CI/docs do not mention a private `@capra` registry for this app.

## Acceptance
- [ ] Lint/test/build green
- [ ] Docs match Capra-only theming
- [ ] Release note drafted (includes palette removal)
- [ ] Grep shows no live `AppStyleId` / `data-nb-style` / `NOTEBOOK_STYLES` usage
