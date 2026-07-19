# Task: Chrome: dialogs, buttons, fields\n\n## Goal
Replace primary chrome controls with Capra components.

## Affected
- `NotebookDialog.tsx`, `DialogProvider.tsx`, `CriblSearchNotebookPickerModal.tsx`
- `Toolbar.tsx`, welcome actions, sidebar New/Delete confirmations
- related CSS rules that become dead

## Work
1. Map dialog service UI to Capra `Modal` (confirm/danger appearances where applicable).
2. Replace `.nb-btn*` toolbar/sidebar actions with `Button` / `IconButton` (+ `@capra/icons`).
3. Replace text inputs in dialogs/toolbar title where practical with `TextField`.
4. Keep DialogService port contract stable; only adapter/UI changes.

## Acceptance
- [ ] Existing dialog flows work (prompt/confirm/alert)
- [ ] Keyboard/focus behavior acceptable (React Aria)
- [ ] Unit/RTL tests updated for new roles/labels as needed
\n