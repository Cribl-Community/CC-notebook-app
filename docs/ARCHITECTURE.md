# Notebook App — Architecture

A human- and LLM-friendly map of the codebase after the 2026 refactor.
This document is the authoritative description of the layering. If you
change it here, update `tsconfig.app.json > paths`, `CLAUDE.md`, and
`AGENTS.md` to match.

## Layering at a glance

```
┌──────────────────────────── app/ ─────────────────────────────┐
│  App.tsx composes every provider and mounts NotebookPage.     │
│  Providers wire real adapters onto abstract Ports.            │
└───────────────────────────────┬───────────────────────────────┘
                                │ depends on
                 ┌──────────────┴──────────────┐
                 ▼                             ▼
       ┌──────────────────┐           ┌──────────────────┐
       │  features/*      │           │  ports/*         │
       │  (vertical       │  depends  │  interfaces      │
       │   slices)        │─────────▶│  KernelPort, …    │
       └──────────┬───────┘           └─────────┬────────┘
                  │                              │
                  │ shared models                │
                  ▼                              ▼
       ┌──────────────────┐           ┌──────────────────┐
       │  domain/*        │           │ platform/adapters│
       │  transport-level │◀─────────▶│ map concrete I/O │
       │  DTOs            │           │ to port contracts│
       └──────────┬───────┘           └─────────┬────────┘
                  │                              │
                  ▼                              ▼
       ┌──────────────────┐           ┌──────────────────┐
       │  platform/*      │           │ app/providers/*  │
       │  concrete I/O    │           │ composition/wire │
       │  Pyodide, Cribl  │           │ default adapters │
       └──────────────────┘           └──────────────────┘
```

### Why this shape?

- **Feature-sliced:** each product feature owns its vertical (model,
  reducer, hooks, UI) in one folder, so changes land in a single slice
  instead of rippling through "types / reducers / components / api"
  silos.
- **Hexagonal:** features depend on interfaces (`ports/`), not on
  concrete network clients or browser APIs. The only code that talks
  to the real Pyodide worker, the Cribl API, or `localStorage` is in
  `platform/` (and a thin adapter glue in `app/providers/`).
- **Composition root:** all wiring lives in `app/App.tsx` + the
  providers. That's the only place where "this abstract port is served
  by this concrete adapter" is spelled out — one place to swap for
  tests, for a different backend, or for a demo mode.

## Directory responsibilities

### `src/app/`

- `App.tsx` — top-level composition. Wraps `NotebookPage` in every
  provider; does nothing else.
- `app/providers/` — React Context providers that expose ports.
  - `EnvProvider` / `useEnv` — current `EnvService` snapshot (Cribl
    API base, KV-mock flag, hosted-or-local flag).
  - `ThemeProvider` / `useTheme` — notebook **visual style** (10 palettes) with
    `localStorage` + `document.documentElement.dataset.nbStyle` sync; CodeMirror
    still receives a `light`/`dark` luma hint for its built-in theme chrome.
  - `DialogProvider` / `useDialogs` — imperative alert/confirm/prompt
    built on `NotebookDialog`. Replaces the old inline dialog state
    inside `NotebookPage`.
  - `AiCodeProvider` / `useAiCodeService` — injects an `AiCodeService`
    implementation. Production: `riptideAiCodeService`. Tests pass a
    stub via the `value` prop.

### `src/features/`

- `notebook/` — the notebook itself.
  - `model/types.ts` — domain types: `Cell`, `CodeCell`, `MarkdownCell`,
    `NotebookState`, and the `NotebookAction` union (grouped into
    `CellStructureAction`, `CellExecutionAction`, `CellOutputAction`,
    `NotebookLifecycleAction` for readability).
  - `reducer/` — pure reducers:
    - `notebookReducer` — single cell/notebook reducer.
    - `tabWorkspace` — multi-tab workspace reducer wrapping it.
    - `outputArea` — shared IOPub-message folding (used by the reducer
      **and** by `PyodideKernel`, so there is exactly one
      implementation of `clear_output { wait: true }`).
  - `codec/ipynb.ts` — nbformat 4 read/write (round-trips to
    `.ipynb`).
  - `executor/` — cell execution strategies.
    - `cellExecutor.ts` — `CellExecutor` / `CellRunOutcome` interfaces.
    - `pythonExecutor.ts` — default kernel.execute() path.
    - `criblSearchExecutor.ts` — `%cribl_search` magic.
    - `executorRegistry.ts` — priority-ordered list; specialized
      executors come first, the Python executor matches everything as
      a fallthrough.
    - `runNotebookCell.ts` — thin dispatcher that picks an executor
      and delegates.
  - `hooks/` — React hooks orchestrating the page.
    - `useNotebookWorkspace` — owns the tab-workspace reducer + refs
      (`workspaceRef`, `activeTabIdRef`) + dispatch helpers.
    - `useTabNotebookRuntime` — per-tab Pyodide lifecycle
      (`TabRuntimeController`: kernel, generation, queue, execution
      count, scheduled set). Accepts a `KernelFactory` for tests.
    - `useCellRunner` — `runCell` / `runCellAndAdvance` / `runAll` /
      `restartKernel` / `stopExecution` / `canStopExecution`.
  - `ui/` — the React components that paint the page.
    `NotebookPage.tsx` is the page composition; `Toolbar`, `CellList`,
    `CellView`, `NotebookTabs`, `NotebookDialog`, …
- `library/` — saved notebooks in KV.
  - `manifest.ts` — pure manifest model + validators.
  - `notebookLibrary.ts` — KV-backed repository.
  - `hooks/useNotebookLibrary.ts` — manifest state + auto-load effect
    + selections + `saveBusy` + `moveDestinations`.
  - `ui/NotebookSidebar.tsx` — tree view.
- `cribl-search/` — parser/editor/renderer for the `%cribl_search`
  magic. Used by the executor and by the CodeMirror KQL highlighter
  in `ui/editor/`.
- `ai-riptide/` — Cribl Riptide integration.
  - `riptideService.ts` — raw request/response helpers.
  - `aiCodeAdapter.ts` — `riptideAiCodeService` implementing the
    `AiCodeService` port (and reporting `isAvailable()` based on the
    Cribl API base).
- `examples/` — bundled notebook examples.
  - `examplesManifest.ts` — pure manifest parsing.
  - `useExamples.ts` — fetches `/Examples/manifest.json`, tracks
    loading/error/selected state, supports `fetch` injection for
    tests.
- `welcome/` — `WelcomePage` + release notes. Now a thin view over
  `useExamples`.

### `src/platform/`

Adapters for real I/O. These are the **only** modules allowed to
touch the network, `window`, or browser workers directly.

- `platform/pyodide/` — Pyodide kernel.
  - `PyodideKernel.ts` — class talking to the Web Worker. Imports
    `kernel.worker.js?raw`, injects two Python bootstrap scripts as
    string substitutions, spawns the Blob-URL worker.
  - `kernel.worker.js` — dedicated worker source (type/lint coverage).
  - `PyodideKernelAdapter.ts` — `KernelFactory` /
    `pyodideKernelFactory` satisfying the `KernelPort` port.
  - `packageFetchCache.ts` — in-memory + Cache API for lazy Pyodide fetches
    (registry hosts plus same-origin `pyodide/*` when bridged from the worker;
    see `PyodideKernel` / `kernel.worker.js`). `pyodideVersion.ts` — runtime
    URLs and release string.
  - `docs/PYODIDE_CUSTOMIZATIONS.md` — upgrade checklist and all non-default
    Pyodide/worker behavior that must be revalidated on version bumps.
- `platform/cribl/` — Cribl network clients: `kvstore`, `searchJobs`,
  `aiTranslate`, …
- `platform/env/env.ts` — environment detection
  (`getCriblApiBase`, `isKvMockMode`, `readEnv`).
- `platform/staticAssets.ts` — resolving static asset URLs under
  `CRIBL_BASE_PATH` vs. local dev.
- `platform/adapters/` — anti-corruption adapters that map concrete
  `platform/*` payloads into `ports/*` contract DTOs.

### `src/domain/`

Pure transport/domain DTOs shared across `ports/*`, features, and adapters.
This avoids `ports/*` importing from `platform/*` or feature internals.

### `src/ports/`

Pure interfaces. Importing from `ports/` is free — no runtime cost,
no coupling to a specific adapter.

| Port | Purpose | Default adapter |
|---|---|---|
| `KernelPort` | Python kernel lifecycle + execute/complete | `PyodideKernelAdapter` |
| `NotebookRepo` | Save/load notebooks (+ manifest) | `notebookLibrary.ts` (Cribl KV) |
| `AiCodeService` | Natural-language → Python, error-fix suggestions | `riptideAiCodeService` |
| `SearchService` | Cribl Search job orchestration | `platform/cribl/searchJobs` |
| `DialogService` | alert / confirm / prompt | `DialogProvider` |
| `EnvService` | Env snapshot (API base, KV mock, hosted flag) | `readEnv()` |

### `src/ui/`

Framework-agnostic UI primitives. Currently just the CodeMirror
Python / KQL setup in `ui/editor/pythonCodeMirror.ts`. Anything that
could be reused outside this feature pie should land here.

### `src/testing/`

- `setup.ts` — Vitest setup (`@testing-library/jest-dom` matchers,
  per-test cleanup).
- `appSmoke.test.tsx` — end-to-end shell smoke test with mocked
  KV fetch and a fake `KernelFactory`, proving every provider and
  hook composes without runtime errors.

## Import rules

- `tsconfig.app.json > paths` maps `@/*`, `@app/*`, `@domain/*`, `@features/*`,
  `@platform/*`, `@ports/*`, `@ui/*`, `@testing/*` — prefer these
  aliases whenever an import would otherwise reach across a layer.
- Layering contract:

  | From ↓ / to → | app | features | platform | ports | ui |
  |---|---|---|---|---|---|
  | `app/`        | ✓   | ✓        | ✓        | ✓     | ✓  |
  | `features/`   | ✗   | own slice only (see below) | ✗ (use ports) | ✓ | ✓ |
  | `platform/`   | ✗   | ✗        | ✓        | ✓     | ✓ |
  | `ports/`      | ✗   | ✗        | ✗        | ✓     | ✗ |
  | `ui/`         | ✗   | ✗        | ✗        | ✗     | ✓ |

- Within `features/`: cross-slice imports are allowed *only* through a
  slice's public barrel (today that means `@features/library/*`,
  `@features/cribl-search/*`, etc.). Cross-slice reaches into private
  internals are a smell — extract a helper into the consumer's own
  slice or into `ui/` first.

## Execution pipeline (mental model)

```
User clicks Run
  → NotebookPage calls runCellAndAdvance(cellId, idx)
  → useCellRunner enqueues on the tab's run queue (TabRuntime)
  → When it's this cell's turn:
      dispatch(SET_RUNNING) → reducer marks cell running
      await kernel.ready     (KernelPort; real impl = Pyodide worker)
      dispatch(SET_KERNEL_STATUS busy)
      pick executor via selectExecutor(source, DEFAULT_CELL_EXECUTORS):
        %cribl_search → criblSearchExecutor
        else          → pythonExecutor
      executor drives kernel.execute(...) and emits IOPub messages
      emit → dispatch(IOPUB)     (reducer folds via applyIOPub)
      success → dispatch(FINISH_CELL)
      error   → dispatch(ERROR_CELL) + CLEAR_ALL_PENDING (halts queue)
      stale   → bail silently (generation has been bumped)
      finally → dispatch(SET_KERNEL_STATUS ready)
```

### Stop / restart semantics

- `stopExecution` bumps the tab's generation (so queued `.then` bodies
  bail on their next stale check), clears the scheduled set, drops the
  queue Promise, disposes the kernel, marks any running cell errored,
  and starts a fresh kernel.
- `restartKernelForTab` is the same flow minus the "mark running
  cell errored" step — used for an explicit "Restart kernel" click.

## Testing

- `npm test` runs Vitest over `src/**/*.test.{ts,tsx}`.
- JSDOM + React Testing Library for UI and hook tests; setup lives in
  `src/testing/setup.ts`.
- Integration smoke: `src/testing/appSmoke.test.tsx` renders the whole
  App shell with stubbed KV and a fake `KernelFactory`.
- Unit tests you can copy from as templates:
  - `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx`
  - `src/features/notebook/hooks/useNotebookWorkspace.test.tsx`
  - `src/features/library/hooks/useNotebookLibrary.test.tsx`
  - `src/features/notebook/executor/cellExecutor.test.ts`
  - `src/features/notebook/executor/pythonExecutor.test.ts`
  - `src/features/notebook/reducer/pendingClear.test.ts`
  - `src/app/providers/DialogProvider.test.tsx`
  - `src/app/providers/EnvProvider.test.tsx`
  - `src/app/providers/ThemeProvider.test.tsx`
  - `src/features/examples/useExamples.test.tsx`

## Adding a feature (recipe)

1. Create `src/features/your-feature/`.
2. Put types in `model/`, pure logic in `reducer/` or helpers, hooks
   in `hooks/`, and React components in `ui/`.
3. If the feature needs I/O, **define a port first** in `ports/` and
   provide an adapter in `platform/`. Wire the port in
   `app/providers/` so tests can substitute.
4. Import using `@features/your-feature/...` aliases; don't reach into
   another feature's internals.
5. Add a test next to each hook/executor/reducer you add.

## Adding a new cell execution mode (recipe)

1. Implement the `CellExecutor` interface in
   `src/features/notebook/executor/`.
2. Add it to `DEFAULT_CELL_EXECUTORS` **before** `pythonExecutor` (the
   Python executor matches everything as a fallthrough).
3. Add a test covering `matches()` and the ok/error paths in the new
   executor file.
