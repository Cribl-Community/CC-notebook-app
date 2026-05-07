# Kernel Loading Banner Interactivity Proposals

Context:
- Request: Make the "Loading Python kernel" banner interactive and informative about progress and errors.
- Research Source: `research/2026-05-07-kernel-loading-banner-research.md`

## Proposal 1 — End-to-end runtime progress model (recommended)

- Overview: Extend the kernel state model to include initialization phase metadata and last init error detail, then drive an interactive banner from that richer state. Add worker init-progress events and propagate them through `PyodideKernel` and `useTabNotebookRuntime` into reducer state.
- Key Changes:
  - Add notebook-level kernel init detail fields and reducer actions in `src/features/notebook/model/types.ts` and `src/features/notebook/reducer/notebookReducer.ts`.
  - Extend worker protocol (`src/platform/pyodide/types.ts`, `src/platform/pyodide/kernel.worker.js`) with init progress event(s).
  - Update `PyodideKernel` and `KernelPort` shape to surface init lifecycle updates to runtime orchestrator.
  - Update `useTabNotebookRuntime` to dispatch phase updates and structured error details.
  - Replace static banners in `src/features/notebook/ui/NotebookPage.tsx` with an interactive status card (step label, optional progress meter/spinner, elapsed info, error details, retry action).
- Trade-offs:
  - Pros: Accurate real progress, reusable state for toolbar/telemetry, actionable error details in UI.
  - Cons: Touches multiple layers (worker protocol + port + reducer + UI), so broader test updates required.
- Validation:
  - Unit tests for reducer lifecycle fields and resets.
  - Runtime hook tests for progress events and detailed error dispatch.
  - Component tests for loading and error card states with retry behavior.
- Open Questions:
  - Should retry trigger `restartKernelForTab` directly from banner or route through existing toolbar restart action callback?
  - Should low-level internal error detail be fully shown by default or behind a details expander?

## Proposal 2 — UI-only simulated progress with existing status model

- Overview: Keep current backend/runtime protocol unchanged and build a richer banner that simulates progress states client-side (time-based messages) while kernel is `loading`, plus displays generic error and restart guidance on `error`.
- Key Changes:
  - Add local component state/timers in `NotebookPage` for pseudo-phase messaging.
  - Improve banner visuals and include a retry button wired to existing restart action.
  - Keep reducer/runtime/worker unchanged.
- Trade-offs:
  - Pros: Low-risk, smaller change surface, faster delivery.
  - Cons: Progress is not real, no true error diagnostics beyond generic text, weaker user trust when delays happen.
- Validation:
  - Component tests for timed phase message changes and error/retry controls.
- Open Questions:
  - Is simulated progress acceptable for support/debug use cases, or is true detail required?

## Chosen approach

Choose **Proposal 1 — End-to-end runtime progress model** because it aligns with existing architecture boundaries (`platform` → `ports` → `features`) and directly satisfies the request to inform users about both progress and encountered errors with truthful, actionable data.
