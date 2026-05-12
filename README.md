# Cribl Notebook App

React + TypeScript notebook UI for the **Cribl App Platform**: Jupyter-style cells, a Pyodide-backed Python kernel, Cribl Search and REST cell magics, and a KV-backed notebook library.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/NAVIGATE.md](./docs/NAVIGATE.md) | **Start here** — first files to open, “if you want to…”, diagrams |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Layering, ports, import rules, execution pipeline, recipes |
| [AGENTS.md](./AGENTS.md) | Platform `fetch` proxy, KV store, git workflow, deployment |
| [docs/E2E_STAGING.md](./docs/E2E_STAGING.md) | Playwright staging E2E setup and when to update specs |
| [docs/PYODIDE_CUSTOMIZATIONS.md](./docs/PYODIDE_CUSTOMIZATIONS.md) | Pyodide worker behavior and upgrade checklist |

## Quick start

```bash
npm install
npm run dev       # Vite — http://localhost:5173
npm test          # Vitest (unit + smoke)
npm run build     # TypeScript + production bundle → dist/
npm run package   # Build + .tgz for Cribl app deploy
```

Additional commands (lint, preview, e2e, deploy) are listed in [CLAUDE.md](./CLAUDE.md).

## Stack

Vite, React 19, TypeScript, Vitest, Playwright (staging regression).
