# Task: Editors & syntax token alignment

## Goal
Align CodeMirror/KQL chrome and syntax colors with Capra light/dark only. No selectable or retained third-party syntax palettes.

## Affected
- `pythonCodeMirror.ts`, KQL highlight CSS, `--nb-cm-*` / `--nb-cm-kql-*` bridge
- `CodeCell.tsx` luma recreation path
- any leftover palette-specific CM tokens

## Work
1. Define **exactly two** syntax token sets (Capra light + Capra dark), hand-tuned from Capra neutrals/accents.
2. Ensure selection/caret/gutters use Capra tokens; switch only when Capra mode changes.
3. Ensure no code path reads `AppStyleId` / `nb-app-style` / `data-nb-style` for editors.
4. Smoke-test Python + KQL highlighting contrast in both modes (WCAG-ish spot check).

## Acceptance
- [ ] Editors usable in both Capra modes; luma switch recreates editor
- [ ] Zero references to removed palette IDs in the editor path
- [ ] No UI to pick an alternate syntax theme
