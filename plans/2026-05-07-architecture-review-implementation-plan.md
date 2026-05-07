# Design Doc: Architecture Hardening for Coupling, Cohesion, Testability, and Security

## Context

The current implementation has a strong architectural target but drift in dependency boundaries (`features/*` and `ports/*` importing `platform/*`/feature internals) and a large orchestration-heavy `NotebookPage` module. This plan restores the intended layering, improves cohesion by extracting orchestration responsibilities, expands test coverage at architecture seams, and hardens security-sensitive rendering paths.

## Requirements

- [ ] Functional requirements
  - Preserve existing notebook workflows (run/stop/restart, save/load, import/export, examples, AI prompt flow, Cribl magics).
  - Keep current user-visible MIME behavior, including scripted HTML outputs that existing examples depend on.
  - Preserve current provider and app bootstrap behavior.
- [ ] Non-functional requirements (performance, security, scale)
  - Reduce architectural coupling by enforcing ports-first dependencies.
  - Increase cohesion by reducing `NotebookPage` responsibilities.
  - Increase test confidence for orchestration and security-sensitive rendering.
  - Preserve current runtime performance and avoid regressions in kernel/search responsiveness.

## Research Summary

- Research doc: `research/2026-05-07-architecture-review-low-coupling-testability-security.md`
- Proposal doc: `plans/2026-05-07-architecture-review-proposals.md`
- Key findings used:
  - Boundary contract exists but is violated in multiple modules.
  - `NotebookPage` is a high-cohesion hotspot.
  - Core execution logic is testable via dependency injection, but there are gaps in page-level and security regression tests.

## Chosen Approach

Proposal 1 — Enforce ports-first boundaries and extract orchestration from `NotebookPage`, while adding architecture and security regression tests.

## Design

### Architecture

1. Introduce neutral, stable domain DTO types for ports to avoid `ports/*` depending on `platform/*` or feature internals.
2. Add adapter translators in `app/` or `platform/` that convert concrete platform responses to port DTOs.
3. Decompose `NotebookPage` orchestration into focused hooks:
   - library persistence actions
   - tab/file actions
   - AI prompt generation flow
   - example/open flows
4. Keep `NotebookPage` as composition + event wiring only.
5. Add lint import-boundary restrictions to match documented layering contract.
6. Add security-focused tests for MIME rendering and message handling.

### Key Changes

| Component | Change | Notes |
|-----------|--------|-------|
| `src/ports/KernelPort.ts` | Remove direct `@platform/pyodide/types` dependency | Define or import neutral completion/IOPub/result types from a port-domain module |
| `src/ports/SearchService.ts` | Remove direct `@platform/cribl/searchJobs` dependency | Expose port-owned result/progress types |
| `src/ports/NotebookRepo.ts` | Remove direct feature import for `Manifest` | Introduce shared domain model module for manifest types |
| `src/features/notebook/ui/NotebookPage.tsx` | Split orchestration into dedicated hooks/services | Keep rendering/composition in page component |
| `src/features/notebook/hooks/*` | Add extracted hooks and tests | Preserve behavior by moving, not redesigning, logic first |
| `src/features/notebook/ui/MimeBundleView.tsx` | Harden scripted iframe messaging validation | Preserve itables/plotly compatibility contract |
| `eslint.config.js` | Add import-boundary rules | Prevent recurrence of forbidden layer dependencies |
| `src/**/*.test.*` | Add orchestration + security regression tests | Cover extracted hooks and MIME paths |

### Data Model

- No external storage schema changes required.
- Internal TypeScript model updates:
  - Introduce shared domain-level DTOs for kernel/search/notebook repo interfaces.
  - Maintain adapter mappings to existing platform response formats.

### API Changes

- No user-facing REST endpoint changes.
- Internal API changes:
  - Port interfaces become platform-neutral.
  - Adapter boundaries gain explicit mapping code.

## Testing Plan

- Unit tests
  - New tests for extracted notebook orchestration hooks (save/open/delete/import/example/AI command paths).
  - New tests for `useCellRunner` behavior (queueing, stale generation, stop/restart semantics).
  - New tests for MIME scripted-render guardrails and sanitize behavior.
  - Updated tests for changed port DTO shapes and adapter mapping.
- Integration tests
  - Extend app smoke to cover key interactions that pass through extracted orchestration services.
  - Add regression tests for maintaining `%cribl_search` and `%%cribl_api` execution paths after port refactors.
- Manual verification steps
  - Run notebook create/save/load/rename/delete flows.
  - Run Python cells, stop execution, restart kernel.
  - Run `%cribl_search` and `%%cribl_api` cells with and without preview.
  - Open bundled examples and verify scripted outputs (e.g., plotly/itables style outputs).

## Rollout

- Migration steps
  - Land changes in ordered PR slices (types/ports first, then orchestration extraction, then lint guards/tests).
  - Keep compatibility adapter shims while migrating call sites, then remove shims.
- Feature flags
  - Not required; refactor is internal with behavior-preserving targets.
- Rollback plan
  - Revert by PR slice if regressions appear (ports refactor can be rolled back independently from MIME hardening/tests).

## Open Questions

- [ ] Final home for shared port-domain DTOs (`src/domain/` vs `src/ports/types/`).
- [ ] Whether to enforce boundaries only at lint-time or also with architecture tests.
- [ ] Exact security hardening scope for scripted iframe outputs while preserving existing compatibility behavior.

## Ordered Sub-Tasks

1. **Define neutral domain DTOs for ports**
   - Acceptance criteria: `KernelPort`, `SearchService`, and `NotebookRepo` no longer import from `platform/*` or feature internals.
   - Affected files: `src/ports/KernelPort.ts`, `src/ports/SearchService.ts`, `src/ports/NotebookRepo.ts`, new shared type module(s).

2. **Add adapter mapping layer for port DTO conversions**
   - Acceptance criteria: platform-specific shapes are mapped at adapter boundaries and all type checks/tests pass.
   - Affected files: `src/platform/pyodide/*`, `src/platform/cribl/*`, `src/features/library/notebookLibrary.ts` (or new adapter modules), relevant tests.

3. **Extract `NotebookPage` orchestration into focused hooks/services**
   - Acceptance criteria: `NotebookPage` significantly reduced to composition/event wiring; behavior parity retained.
   - Affected files: `src/features/notebook/ui/NotebookPage.tsx`, new/updated files under `src/features/notebook/hooks/` and possibly `src/features/library/hooks/`.

4. **Add tests for orchestration gaps**
   - Acceptance criteria: dedicated tests exist for `useCellRunner` and extracted page orchestration logic.
   - Affected files: new `*.test.ts(x)` under `src/features/notebook/hooks/` and related modules.

5. **Harden scripted MIME rendering message path**
   - Acceptance criteria: postMessage handling validates origin/source/shape constraints while preserving current scripted output compatibility.
   - Affected files: `src/features/notebook/ui/MimeBundleView.tsx`, related MIME tests.

6. **Add MIME sanitization/security regression tests**
   - Acceptance criteria: tests cover sanitized HTML/Markdown/SVG paths and scripted iframe behavior boundaries.
   - Affected files: new tests near `src/features/notebook/ui/MimeBundleView.tsx` and/or `MarkdownCell.tsx`.

7. **Enforce architecture boundaries in lint config**
   - Acceptance criteria: lint rules fail on forbidden layer imports aligned with `docs/ARCHITECTURE.md`.
   - Affected files: `eslint.config.js` (plus any helper config modules if needed).

8. **Update architecture docs to reflect final module boundaries**
   - Acceptance criteria: docs match implemented dependencies and migration notes are captured.
   - Affected files: `docs/ARCHITECTURE.md`, optionally `AGENTS.md` and `CLAUDE.md` if conventions changed.
