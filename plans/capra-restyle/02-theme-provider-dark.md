# Task: ThemeProvider → Capra light/dark

## Goal
Replace multi-palette `data-nb-style` ownership with Capra light/dark via `.dark`. **Drop all palettes** — no picker, no syntax-only themes.

## Affected
- `src/app/providers/ThemeProvider.tsx`, `ThemeProvider.test.tsx`
- `src/app/styles/nbStyles.ts` (replace with light/dark helpers; delete `AppStyleId` / `NOTEBOOK_STYLES`)
- `Toolbar.tsx` style control (remove 10-option `<select>`)
- `index.html` initial attributes/classes (`data-nb-style` removed)

## Work
1. Introduce theme mode type `'light' | 'dark'` (storage key e.g. `nb-capra-theme`).
2. Sync `document.documentElement.classList.toggle('dark', mode === 'dark')`; stop setting `dataset.nbStyle`.
3. One-time migration from `nb-app-style` / legacy `nb-theme`:
   - `cribl-pro` / `light` → light
   - `cribl-midnight` / `dark` → dark
   - **any other palette id → light**
4. Replace toolbar palette `<select>` with a Capra light/dark control (`Switch` or equivalent).
5. Derive `codeMirrorLuma` solely from Capra mode.
6. Remove exports/usages of `NOTEBOOK_STYLES`, `cycleAppStyle`, `AppStyleId` (update tests/callers).

## Acceptance
- [ ] Tests cover migration + `.dark` class toggle; no palette API remains
- [ ] Toolbar has no multi-palette picker
- [ ] Reload persistence works (or documents sandbox localStorage limits)
- [ ] Default is light (prior cribl-pro equivalent)
