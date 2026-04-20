# Plan: Welcome tab + Examples notebooks

## Scope

- Initial workspace opens a **Welcome** tab (not Untitled) with marketing copy, how-it-works, bundled Examples cards, and rolling **release notes** from `src/notebook/releaseNotes.ts`.
- **`public/Examples/`** ships two valid `.ipynb` files; Welcome opens them via `fetch` + `ipynbTextToLoadPayload` into a new notebook tab.
- **Tab model** uses `kind: 'welcome' | 'notebook'`; welcome tabs skip Pyodide kernel and notebook reducers.
- **Tab completion**: Jedi loaded in the worker; Python completion falls back to Jedi when attribute completion does not apply; CodeMirror always asks the kernel (not only after `.`).
- **Regenerate** example files: `node scripts/write-examples-ipynb.mjs`

## Key files

- `src/notebook/tabWorkspace.ts`, `NotebookPage.tsx`, `Toolbar.tsx`, `WelcomePage.tsx`, `releaseNotes.ts`
- `public/Examples/*.ipynb`, `scripts/write-examples-ipynb.mjs`
- `src/pyodide/notebook_complete.py`, `PyodideKernel.ts`, `pythonCodeMirror.ts`
