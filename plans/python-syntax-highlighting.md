# Plan: Python syntax highlighting (Jupyter-like)

## Context

Match classic Jupyter notebook-style Python highlighting: green keywords (with bold for major keyword classes), string literals, neutral identifiers, and matching-bracket highlight. Implementation uses CodeMirror 6 already present in `src/notebook/pythonCodeMirror.ts`.

## Chosen approach

Custom `HighlightStyle` + `syntaxHighlighting` from `@codemirror/language`, CSS variables in `src/index.css`, and `bracketMatching()` with themed `.cm-matchingBracket`.

## Limitation

Lezer Python maps `"with as print"` to the same `tags.keyword`; `import` uses `tags.moduleKeyword`. Bold-on-import vs non-bold-on-print is achievable; making **`as` bold like `import` but not like `print`** is not possible without a custom highlighter.

## Sub-tasks

1. Add `--nb-cm-*` variables for dark/light in `src/index.css`.
2. Implement `HighlightStyle`, `syntaxHighlighting`, and `bracketMatching` in `src/notebook/pythonCodeMirror.ts`; add `@lezer/highlight` to `package.json` if needed for `tags`.
3. Theme matching brackets; manually verify both themes.
4. Run `npm run lint` and `npm test`.

## Files

- `src/index.css`
- `src/notebook/pythonCodeMirror.ts`
- `package.json` (optional direct dep)
