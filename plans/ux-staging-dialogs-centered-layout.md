# Plan: UX (staging-safe dialogs), remove menu, nested folders, non-fullscreen layout

**Source:** RePPIT research (2026-04-18).  
**Epic scope:** Staging forbids native `window.alert` / `confirm` / `prompt`; replace with in-app dialogs; remove placeholder menubar; improve nested-folder UX; constrain layout so the UI does not fill the entire viewport.

## Sub-tasks (acceptance criteria)

### 1. Dialog / modal primitives
- Add a small reusable modal layer (e.g. `NotebookDialog` + `useDialogState` or React state in `NotebookPage`) using semantic HTML (`role="dialog"`, `aria-modal="true"`, focus trap optional v1).
- Support variants: alert (single OK), confirm (Cancel + OK), prompt (label + text input + Cancel + OK).
- Styles in `src/index.css` aligned with existing Jupyter-ish tokens (`--nb-bg-toolbar`, borders).

### 2. Replace all blocking popups in `NotebookPage.tsx`
- Map each `window.alert` → alert dialog with message (and optional title).
- Map `window.confirm` (close tab, delete) → confirm dialog.
- Map `window.prompt` (new folder, rename) → prompt dialog with validation (trim, empty name).
- Ensure async flows (save, delete, move) close dialogs and do not double-submit.

### 3. Remove menubar
- Remove `<NotebookMenuBar />` from `NotebookPage.tsx` and delete or keep `NotebookMenuBar.tsx` unused (prefer delete if nothing imports it).
- Remove `.nb-menubar*` rules from `src/index.css` if unused.

### 4. Centered, non-fullscreen shell
- Adjust `#root` / `.nb-page` (or a new wrapper) so the notebook “app” is max-width and max-height constrained, centered (`margin: auto`), with outer gutter background distinct from inner workspace (optional subtle border/shadow).
- Preserve sidebar + editor split inside the frame; avoid horizontal overflow on small viewports.

### 5. Nested folders — UX hardening
- **Data:** Already supported (`manifestAddFolder(manifest, name, selectedParentId)` in `notebookLibrary.ts`).
- **UI:** Ensure “New folder” always creates under the current breadcrumb folder (`selectedParentId`); add row-level affordance (e.g. “New folder here” on folder row or overflow menu) so users need not rely only on global toolbar.
- **Rename/delete:** Already work on nested items via tree; verify move panel destinations include nested paths (`listMoveTargets` in `manifest.ts`).

### 6. Manual verification
- In staging-like environment: no native dialogs when saving, renaming, deleting, closing dirty tab, importing.
- Nested folder create/rename/delete/move still consistent with manifest.

## Affected files (expected)
- `src/notebook/NotebookPage.tsx` — dialogs, remove menubar, layout wrapper props.
- `src/notebook/NotebookSidebar.tsx` — optional callback for “new folder under this folder”.
- `src/index.css` — shell constraints, dialog styles, menubar removal.
- New: `src/notebook/NotebookDialog.tsx` (or similar).

## Out of scope (this epic)
- Pyodide / package size / proxies workarounds (separate track).
