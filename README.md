# Cribl Notebook App

React + TypeScript notebook UI for the **Cribl App Platform**: Jupyter-style cells, a Pyodide-backed Python kernel, Cribl Search and REST cell magics, and a KV-backed notebook library.

## Installing in Cribl

In the Cribl UI, go to **Apps → Install App** and use one of the following methods.

### Install from file

1. Open [GitHub Releases](https://github.com/Cribl-Community/CC-notebook-app/releases) and download `notebook-app-X.Y.Z.tgz` for the version you want.
2. Choose **Import from File** and upload the `.tgz`.

### Install from Git

1. Choose **Import from Git**.
2. Set **URL** to `https://github.com/Cribl-Community/CC-notebook-app.git`.
3. Set **Branch or tag** to a release tag (e.g. `v1.4.3`). The tag is required — leaving it blank causes the import to fail.
4. Wait for the [Release workflow](https://github.com/Cribl-Community/CC-notebook-app/actions/workflows/release.yml) to finish on that tag before importing; CI publishes the built app (`static/`, `default/proxies.yml`) with the same layout as the `.tgz`.

## Documentation

| Document | Purpose |
| --- | --- |
| [docs/NAVIGATE.md](./docs/NAVIGATE.md) | **Start here** — first files to open, “if you want to…”, diagrams |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | Layering, ports, import rules, execution pipeline, recipes |
| [docs/PLATFORM.md](./docs/PLATFORM.md) | Cribl integration reference: globals, `fetch` proxy, KV store, config groups, `proxies.yml` |
| [docs/E2E_STAGING.md](./docs/E2E_STAGING.md) | Playwright staging E2E setup and when to update specs |
| [docs/PYODIDE_CUSTOMIZATIONS.md](./docs/PYODIDE_CUSTOMIZATIONS.md) | Pyodide worker behavior and upgrade checklist |
| [docs/riptide-api.md](./docs/riptide-api.md) | Cribl Riptide AI agent endpoint contract |
| [CLAUDE.md](./CLAUDE.md) / [AGENTS.md](./AGENTS.md) | Agent guides: full command reference, git workflow, publishing |

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
