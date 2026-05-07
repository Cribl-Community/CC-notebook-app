# Architecture Improvement Proposals

Context:
- Request: Architecture review focused on low coupling/high cohesion, testability, and security.
- Research Source: `research/2026-05-07-architecture-review-low-coupling-testability-security.md`.

## Proposal 1 — Enforce Ports-First Boundaries + Extract NotebookPage Application Services

- Overview: Restore documented hexagonal boundaries by moving platform and feature-specific types out of `ports/*`, then split `NotebookPage` orchestration into focused application hooks/services. Add targeted tests for orchestration and MIME security-sensitive behavior.
- Key Changes:
  - Redesign `ports/*` contracts to be platform-neutral and feature-neutral.
  - Add app-level adapter/wiring modules that map platform types/services to port shapes.
  - Extract notebook/library/AI/example orchestration logic out of `NotebookPage` into composable hooks under `features/notebook/hooks` or `app/*`.
  - Add lint guardrails to prevent future direct feature -> platform coupling drift.
  - Add missing tests for `useCellRunner`, page-level orchestration, and MIME scripted/sanitized rendering behavior.
- Trade-offs:
  - Benefits: strongest long-term coupling control, easier substitution in tests, clearer ownership boundaries.
  - Costs: larger refactor surface and temporary migration complexity.
- Validation:
  - Existing test suite + new orchestration/security tests.
  - Static import-boundary checks in lint CI.
- Open Questions:
  - Should domain types shared by ports/features live in a new `src/domain/` package, or be duplicated as anti-corruption DTOs in adapters?
  - Should `NotebookPage` extraction stop at hooks, or introduce an explicit application-service layer?

## Proposal 2 — Security-First Hardening + Targeted Architectural Cleanup

- Overview: Keep current structure mostly intact and prioritize hardening high-risk rendering paths (scripted HTML iframe path) and adding tests around those controls; perform minimal coupling cleanup only in the most critical interfaces.
- Key Changes:
  - Harden message handling and sandbox behavior in scripted MIME rendering.
  - Add security regression tests around sanitization and scripted output handling.
  - Clean only top coupling hotspots (`KernelPort`, `SearchService`), defer full layering cleanup.
- Trade-offs:
  - Benefits: lower immediate risk and faster delivery on security concerns.
  - Costs: retains architectural drift and does not substantially improve long-term cohesion/coupling.
- Validation:
  - Security-focused tests + manual notebook output checks.
- Open Questions:
  - Is incremental cleanup acceptable given explicit layering contract violations already present?
  - Will partial port cleanup create two parallel patterns that increase cognitive load?

## Selected Proposal

**Proposal 1** is the stronger choice for this codebase because it aligns with the repository’s documented architecture contract (`docs/ARCHITECTURE.md`) and addresses root causes (dependency drift + orchestration sprawl) while also covering security and testability improvements.
