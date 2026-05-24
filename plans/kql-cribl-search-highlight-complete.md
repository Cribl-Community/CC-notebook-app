# Plan: KQL highlighting + Tab completion for `%%cribl_search`

Parent tracker for editor support in Cribl Search magic cells. Chosen approach: **decoration-based KQL highlighting + editor-local completion sources** (see RePPIT proposal).

## Sub-tasks

1. **Region + tokenizer utilities** — `detectCriblSearchEditorMode(doc, pos)`, KQL line tokenizer (keywords, pipes, strings, numbers, identifiers). Tests in vitest.
2. **Highlight overlay** — ViewPlugin / `EditorView.decorations` marking KQL body spans; theme vars in `index.css` (`--nb-cm-kql-*`).
3. **Tab completions** — Extend `autocompletion` override in `pythonCodeMirror.ts`: magic header (`%%cribl_search`, `var=`, `preview=`) + KQL keyword / pipe-context lists.
4. **Integration + QA** — Wire extensions, manual check in both themes; ensure Python `.` completion unchanged.
