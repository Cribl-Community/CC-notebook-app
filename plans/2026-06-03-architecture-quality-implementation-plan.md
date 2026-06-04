# Design Doc: Architecture Quality Improvement (Coupling, Cohesion, Readability, Testability)

## Context

The codebase already enforces key hexagonal boundaries and has strong core execution tests, but orchestration logic is still concentrated in a few large modules. This plan improves cohesion/readability and testability by decomposing those modules into smaller responsibility-focused units while preserving behavior and existing adapter contracts.

## Requirements

- [ ] Functional requirements
  - Preserve notebook UX and behavior for run/stop/restart, save/load, import/export, examples, and AI generation.
  - Preserve current provider composition and executor ordering behavior.
  - Avoid introducing user-visible behavior changes during decomposition.
- [ ] Non-functional requirements (performance, security, scale)
  - Reduce module-level coupling and clarify ownership boundaries.
  - Increase cohesion via smaller single-purpose orchestration units.
  - Improve readability for humans and agents through predictable public APIs and lower per-file complexity.
  - Increase testability by isolating side-effectful flows behind narrow interfaces.

## Research Summary

- Research doc: `research/2026-06-03-architecture-quality-research.md`
- Proposal doc: `plans/2026-06-03-architecture-quality-proposals.md`
- Key findings used:
  - Ports/domain boundaries are now mostly healthy.
  - Current quality hotspot is orchestration concentration in notebook page-layer modules.
  - Test coverage is strong in runtime/executors, weaker in library orchestration command coverage.

## Chosen Approach

Proposal 1 — Vertical orchestration slices + explicit feature public APIs.

## Design

### Architecture

1. Keep `App` + providers and current port/adapter model unchanged.
2. Refactor notebook orchestration into smaller modules grouped by responsibility:
   - runtime/run commands
   - library persistence commands
   - tab/file commands
   - AI prompt commands
3. Keep `NotebookPage` as composition and event wiring only.
4. Standardize cross-feature access through explicit public feature exports.
5. Add targeted tests for each extracted orchestration module/hook.
6. Add guardrails in lint/docs to maintain these boundaries.

### Key Changes

| Component | Change | Notes |
|-----------|--------|-------|
| `src/features/notebook/ui/NotebookPage.tsx` | Reduce to composition + wiring | Move command/orchestration bodies out |
| `src/features/notebook/hooks/useNotebookLibraryActions.ts` | Split into focused hooks/modules | Separate save/load/import/delete/move concerns |
| `src/features/notebook/hooks/useCellRunner.ts` | Extract queue/dispatch helpers | Keep hook API stable for callers |
| `src/features/**/index.ts` | Add/normalize public exports | Cross-feature imports use public surfaces only |
| `eslint.config.js` | Add guardrails for public-surface usage and readability conventions | Protect against future drift |
| `docs/ARCHITECTURE.md`, `docs/NAVIGATE.md` | Update module map and entry points | Keep docs aligned with reality |

### Data Model

- No storage/API schema changes.
- Internal model consistency changes only:
  - function/module boundaries for orchestration concerns.
  - explicit exported interfaces for command modules where useful.

### API Changes

- No external API changes.
- Internal API adjustments:
  - Hook internals decomposed into helper modules.
  - Cross-feature imports aligned to public exports.

## Testing Plan

- Unit tests
  - Add tests for extracted notebook library command modules/hook branches.
  - Add tests for extracted queue/dispatch helpers in cell-runner flow.
  - Keep existing `useCellRunner` and runtime tests green while increasing branch coverage.
- Integration tests
  - Extend `NotebookPage` tests for wiring-level confidence where orchestration extraction changes props/callback wiring.
  - Keep app smoke test validating composition root stability.
- Manual verification steps
  - Open notebook, run single cell, run all, stop, restart kernel.
  - Save new notebook, reopen existing, rename, move, delete.
  - Import file and open example notebook.
  - Trigger AI generate flow and verify error/availability handling.

## Rollout

- Migration steps
  - Land in small commits by concern (module extraction first, then import cleanup, then tests/docs/guardrails).
  - Preserve existing exported hook signatures while internals move.
- Feature flags
  - Not required; behavior-preserving internal refactor.
- Rollback plan
  - Revert per concern slice if regressions appear (library actions, runner helpers, or public API cleanup independently).

## Open Questions

- [ ] Whether to codify max-lines/max-complexity in ESLint or keep as documented convention.
- [ ] Whether orchestration helpers should remain under `hooks/` or move to `application/` within `features/notebook/`.

## Ordered Sub-Tasks

1. **Define target orchestration boundaries and file layout**
   - Acceptance criteria: agreed responsibility map exists for `NotebookPage`, library actions, and cell runner internals; destination modules are identified.
   - Affected files/paths: `src/features/notebook/ui/NotebookPage.tsx`, `src/features/notebook/hooks/`, `docs/ARCHITECTURE.md` (planning notes section if needed).

2. **Extract notebook library command flows into focused modules**
   - Acceptance criteria: `useNotebookLibraryActions` delegates to smaller, cohesive command units with unchanged external behavior.
   - Affected files/paths: `src/features/notebook/hooks/useNotebookLibraryActions.ts`, new modules under `src/features/notebook/hooks/` (or `src/features/library/hooks/` as appropriate).

3. **Extract cell runner queue/dispatch helpers for readability**
   - Acceptance criteria: `useCellRunner` keeps the same public API but internal queue/stale/error handling branches are separated into testable helpers.
   - Affected files/paths: `src/features/notebook/hooks/useCellRunner.ts`, new helper modules under `src/features/notebook/hooks/` or `src/features/notebook/executor/`.

4. **Slim `NotebookPage` to composition and event wiring**
   - Acceptance criteria: page component primarily composes hooks/components and no longer hosts large orchestration callback bodies.
   - Affected files/paths: `src/features/notebook/ui/NotebookPage.tsx`, related extracted hooks/modules.

5. **Standardize feature public surfaces**
   - Acceptance criteria: cross-feature imports use explicit feature-level exports; private internals are no longer imported from other slices.
   - Affected files/paths: `src/features/**/index.ts`, import sites in `src/features/**` and `src/app/**`.

6. **Add and update tests for extracted orchestration logic**
   - Acceptance criteria: new tests cover key success/error branches for extracted library and cell-runner command paths.
   - Affected files/paths: new `*.test.ts(x)` near extracted modules, existing tests under `src/features/notebook/hooks/` and `src/features/notebook/ui/`.

7. **Add guardrails and refresh documentation**
   - Acceptance criteria: lint/docs codify the refined boundaries and onboarding docs point to new orchestration entry points.
   - Affected files/paths: `eslint.config.js`, `docs/ARCHITECTURE.md`, `docs/NAVIGATE.md`, and optionally `AGENTS.md`/`CLAUDE.md` if conventions are updated.
