# Architecture Review Research (Low Coupling, Cohesion, Testability, Security)

## High-level summary

The repository has a clearly documented feature-sliced hexagonal target architecture, with a thin composition root and explicit provider wiring. Runtime-critical flows are decomposed into focused hooks/executors with dependency injection points that improve unit-testability. In practice, the current implementation has boundary drift: many feature and port modules directly depend on platform internals, and one UI module (`NotebookPage`) carries substantial orchestration responsibility. Security controls are present around HTML/Markdown sanitization and proxy allowlists, but there is an intentional high-trust rendering path for script-bearing HTML outputs. Tests are strong for reducers/executors/parsers and weaker at page-level orchestration and rendering security regression coverage.

## Detailed findings

### 1) Declared layering and composition root are explicit

- Layering contract and architecture intent are documented with a strict dependency matrix in `docs/ARCHITECTURE.md:178-197`.
- App composition is minimal: providers + page mount only, in `src/App.tsx:1-16`.
- Provider barrel and typed exports are centralized in `src/app/providers/index.ts:1-7`.

### 2) Boundary drift between docs and code-level dependencies

- `docs/ARCHITECTURE.md` states features should not depend on `platform/*` directly and should use ports (`docs/ARCHITECTURE.md:188-190`), but multiple feature modules import `@platform/*` (for example `src/features/notebook/executor/criblSearchExecutor.ts:2-5`, `src/features/notebook/ui/NotebookPage.tsx:34`, `src/features/examples/useExamples.ts:3`, `src/features/library/notebookLibrary.ts:1`).
- Several port interfaces depend on platform/feature types instead of being fully platform-agnostic:
  - `src/ports/KernelPort.ts:6-8` re-exports Pyodide types from `@platform/pyodide/types`.
  - `src/ports/SearchService.ts:6-11` imports/re-exports search result/progress types from `@platform/cribl/searchJobs`.
  - `src/ports/NotebookRepo.ts:5` imports `Manifest` from `features/library`.

### 3) Cohesion hotspot: `NotebookPage` owns broad orchestration

- `src/features/notebook/ui/NotebookPage.tsx:1-35` imports many cross-feature and platform modules.
- The component contains workspace lifecycle, AI prompt generation, file import/export, library CRUD, tab actions, and welcome/example loading in one unit (`src/features/notebook/ui/NotebookPage.tsx:36-561`).
- Several large callback handlers are embedded directly in the page (for example save/open/delete/move/import/example handlers at `src/features/notebook/ui/NotebookPage.tsx:209-446`), indicating mixed concerns in a single module.

### 4) Existing testability strengths

- Runtime and execution orchestration has dependency injection seams:
  - kernel factory injection in `src/features/notebook/hooks/useTabNotebookRuntime.ts:66-71`.
  - executor dependency override objects in `src/features/notebook/executor/criblApiExecutor.ts:26-55` and `src/features/notebook/executor/criblSearchExecutor.ts:22-46`.
- Unit tests cover key executor behavior and error handling:
  - Cribl API executor tests in `src/features/notebook/executor/criblApiExecutor.test.ts:58-131`.
  - Cribl Search executor tests in `src/features/notebook/executor/criblSearchExecutor.test.ts:50-112`.
  - Tab runtime hook tests in `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx:38-112`.
- Whole-app smoke wiring exists in `src/testing/appSmoke.test.tsx:47-55`.

### 5) Current test coverage gaps relevant to architecture quality

- No direct tests found for:
  - `useCellRunner` behavior (no matching `useCellRunner` tests in `src/features/notebook/hooks`).
  - `NotebookPage` orchestration behavior (no page-level tests matching `NotebookPage`).
  - MIME sanitization/security regression behavior (no tests referencing DOMPurify sanitize behavior in test files).

### 6) Security controls present in rendering/network paths

- HTML/SVG/Markdown output paths sanitize content with DOMPurify:
  - HTML and SVG sanitization in `src/features/notebook/ui/MimeBundleView.tsx:108-127`.
  - Markdown sanitization in `src/features/notebook/ui/MimeBundleView.tsx:140-149`.
  - Markdown cell rendering sanitization in `src/features/notebook/ui/MarkdownCell.tsx:18-21`.
- Network/proxy hardening signals:
  - Proxies are allowlisted in `config/proxies.yml:6-20`.
  - Pyodide release/proxy alignment and no external Cribl AI hosts are tested in `src/features/welcome/proxiesConfig.test.ts:9-20`.
  - Search fetches use explicit timeout via `AbortSignal.timeout` in `src/platform/cribl/searchJobs.ts:442-447`.
  - Worker fetch bridging includes specific handling for auth/header constraints in `src/platform/pyodide/PyodideKernel.ts:161-168`.

### 7) Security trade-off zone: scripted HTML rendering

- Script-bearing HTML outputs are rendered via iframe `srcdoc` with `sandbox="allow-scripts allow-same-origin"` in `src/features/notebook/ui/MimeBundleView.tsx:98-104`.
- Cross-frame global import/export and wildcard `postMessage('*')` are used for output behavior compatibility (`src/features/notebook/ui/MimeBundleView.tsx:47-75` and `src/features/notebook/ui/MimeBundleView.tsx:65-67`).
- The file explicitly documents this as a trust-level trade-off aligned with executing user-authored notebook code (`src/features/notebook/ui/MimeBundleView.tsx:28-31`).
