# Architecture Quality Proposals

Context:
- Request: Make the code loosely coupled, highly cohesive, readable by humans and agents, and testable.
- Research Source: `research/2026-06-03-architecture-quality-research.md`.

## Proposal 1 — Vertical Orchestration Slices + Explicit Feature Public APIs

- Overview: Keep current architecture direction, but split orchestration-heavy notebook flows into smaller command hooks/modules by responsibility and expose each feature through explicit public entrypoints. This focuses on reducing cognitive load while preserving behavior and existing adapters.
- Key Changes:
  - Decompose `NotebookPage` orchestration boundaries further (AI flow, library commands, tab/file commands, runtime commands).
  - Split `useNotebookLibraryActions` into smaller hooks/services with narrow interfaces.
  - Introduce/standardize feature-level public `index.ts` exports and consume only those across feature boundaries.
  - Add tests per extracted orchestration unit with existing provider injection seams.
  - Add lightweight lint/documentation guardrails around module size/public API usage.
- Trade-offs:
  - Benefits: highest readability/cohesion gain with low architectural risk; minimal behavior change.
  - Costs: moderate refactor effort and temporary churn across imports/tests.
- Validation:
  - Existing `npm test` suite plus new hook-level orchestration tests and selective page integration tests.
  - Lint pass with tightened boundary/readability rules.
- Open Questions:
  - Thresholds for module-size guardrails (hard lint max-lines vs team convention)?
  - Preferred location for orchestration command modules (`features/notebook/hooks` vs `features/notebook/application`)?

## Proposal 2 — App-Level Service Layer for All Side Effects

- Overview: Introduce a more explicit application-service layer between UI hooks and adapters, moving async commands (library I/O, runtime control, AI calls, fetches) into service objects injected via providers.
- Key Changes:
  - Create service interfaces for notebook runtime/library/AI operations.
  - Shift `useCellRunner` and `useNotebookLibraryActions` orchestration logic into service classes/modules.
  - Keep hooks thin wrappers that translate UI events to service commands.
  - Expand test strategy around service contracts and integration wiring.
- Trade-offs:
  - Benefits: strongest decoupling and testability boundaries over time.
  - Costs: higher migration complexity and possible over-abstraction for current app size.
- Validation:
  - Contract tests for services + existing feature tests.
  - Incremental migration checks to prevent behavior regressions.
- Open Questions:
  - Is added abstraction worth complexity for this codebase size?
  - Should service interfaces live under `ports/` or a new `features/*/application` namespace?

## Selected Proposal

**Proposal 1** is the stronger fit for this codebase right now. It aligns with existing conventions, addresses the current hotspot modules directly, and improves readability/cohesion/testability without introducing a heavy new abstraction layer.
