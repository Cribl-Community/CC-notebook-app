# Architecture Quality Research (Coupling, Cohesion, Readability, Testability)

## High-level summary

The repo currently follows the documented feature-sliced hexagonal architecture with a thin composition root and provider-based dependency injection. Compared to earlier architecture reviews, key coupling hotspots in `ports/*` have already been addressed by moving shared contracts into `domain/*`. The main remaining cohesion/readability hotspot is orchestration concentration in notebook page-level flows (`NotebookPage` + `useNotebookLibraryActions` + `useCellRunner`) where large callback bodies mix UI, state transitions, and persistence/runtime concerns. Test coverage is strong around reducers, executors, and runtime hooks, while orchestration-heavy hooks still have uneven direct coverage. Existing lint guardrails enforce major boundaries, but there is room to tighten module-level readability and public-surface conventions.

## Detailed findings

### 1) Layering and dependency inversion are actively implemented

- `App` is a pure composition root that nests providers then mounts `NotebookPage`, with no product logic (`src/App.tsx:1-33`).
- Provider modules expose injectable defaults via context and optional overrides, supporting test doubles (`src/app/providers/EnvProvider.tsx:12-24`, `src/app/providers/AiCodeProvider.tsx:6-30`).
- Architecture docs explicitly define allowed dependency directions and enforce feature -> ports/provider access patterns (`docs/ARCHITECTURE.md:261-299`).

### 2) Prior port-coupling drift appears mostly resolved

- `KernelPort` now depends on domain kernel DTOs rather than platform-specific types (`src/ports/KernelPort.ts:6-24`).
- `SearchService` now depends on domain search DTOs (`src/ports/SearchService.ts:6-32`, `src/domain/search.ts:11-29`).
- `NotebookRepo` now depends on domain library manifest types (`src/ports/NotebookRepo.ts:5-13`, `src/domain/notebookManifest.ts:1-16`, `src/features/library/manifest.ts:1-2`).
- Feature-layer direct `@platform/*` imports are now constrained to a documented composition exception in executor registry (`src/features/notebook/executor/executorRegistry.ts:3-37`).

### 3) Cohesion/readability hotspot: notebook orchestration remains concentrated

- `NotebookPage` still coordinates many concerns: workspace state, library actions, runtime setup, AI generation, tab lifecycle, and full rendering (`src/features/notebook/ui/NotebookPage.tsx:23-400`).
- `useCellRunner` has a long, queue-driven control flow that interleaves stale checks, reducer dispatches, executor selection, runtime mutations, and error semantics (`src/features/notebook/hooks/useCellRunner.ts:65-304`).
- `useNotebookLibraryActions` includes multiple async command handlers (save/open/rename/delete/move/import/examples) in a single module (`src/features/notebook/hooks/useNotebookLibraryActions.ts:63-357`).

### 4) Testability strengths and remaining gaps

- Core runtime/execution seams are testable and covered (`src/features/notebook/hooks/useTabNotebookRuntime.test.tsx`, `src/features/notebook/hooks/useCellRunner.test.tsx`, `src/features/notebook/executor/*.test.ts`).
- Page shell behavior has focused tests for kernel banners and retry affordance (`src/features/notebook/ui/NotebookPage.test.tsx:120-159`).
- App-level provider wiring has a smoke test that prevents composition regressions (`src/testing/appSmoke.test.tsx:48-56`).
- No dedicated test file currently targets `useNotebookLibraryActions`, despite it being a major orchestration surface (`src/features/notebook/hooks/useNotebookLibraryActions.ts:63-357`).

### 5) Guardrails exist, but readability conventions can be made more enforceable

- ESLint already blocks direct feature imports from `@platform/*` (with test exemptions) and blocks problematic `@app/*` paths (`eslint.config.js:48-77`).
- The same config can support stronger cohesion/readability by formalizing public API surfaces per feature slice and discouraging oversized multi-responsibility modules.

## Research notes for this RePPIT run

- Prior architecture-review artifacts exist from 2026-05-07 (`research/2026-05-07-architecture-review-low-coupling-testability-security.md`, `plans/2026-05-07-architecture-review-proposals.md`, `plans/2026-05-07-architecture-review-implementation-plan.md`), but several findings there are now outdated (notably port-coupling and missing `useCellRunner` tests).
- This document supersedes those outdated points for the current request.
