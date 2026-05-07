# Implementation Plan: Interactive Python Kernel Loading Banner

Chosen proposal: End-to-end runtime progress model.

## Scope

Deliver an interactive kernel-loading banner that shows initialization progress and meaningful error details for notebook tabs, while preserving existing run-cell semantics and per-tab kernel lifecycle behavior.

Out of scope:
- Changes to code-cell execution output rendering.
- New telemetry backend or persistence of init diagnostics beyond in-memory tab state.

## Design summary

1. Extend notebook state with `kernelInit` metadata (phase key/label, optional progress percent, timestamp/elapsed hints, and last error detail).
2. Extend worker/main-thread protocol to emit init-progress events at each initialization milestone and include structured init error details.
3. Route those events through `PyodideKernel` and runtime orchestration (`useTabNotebookRuntime`) into reducer actions.
4. Replace static loading/error banners in `NotebookPage` with an interactive status card that:
   - shows current step and progress affordance while loading,
   - exposes concise error summary and optional details on failure,
   - offers retry action via existing restart kernel path.
5. Add tests for reducer state transitions, runtime dispatch behavior, and banner rendering/actions.

## Ordered implementation sub-tasks

### 1) Add kernel-init detail model and reducer actions

Affected files:
- `src/features/notebook/model/types.ts`
- `src/features/notebook/reducer/notebookReducer.ts`
- `src/features/notebook/reducer/tabWorkspace.ts`

Steps:
- Introduce typed kernel-init state (phase/status detail and error payload) under `NotebookState`.
- Add notebook actions for init progress updates and init failure detail (or a combined lifecycle payload action).
- Ensure initial, restart, and notebook-replace flows reset/init these fields predictably.

Acceptance criteria:
- Notebook state can represent both coarse `kernelStatus` and detailed init progress/error.
- Reducer transitions are deterministic and preserve existing behavior for unrelated actions.

### 2) Extend worker protocol and Pyodide kernel adapter for progress/error detail

Affected files:
- `src/platform/pyodide/types.ts`
- `src/platform/pyodide/kernel.worker.js`
- `src/platform/pyodide/PyodideKernel.ts`
- `src/ports/KernelPort.ts`
- `src/platform/pyodide/PyodideKernelAdapter.ts` (if typing requires adaptation only)

Steps:
- Add outbound worker message type(s) for init progress milestones and richer init error metadata.
- Emit progress events at key init boundaries in `kernel.worker.js`.
- Update `PyodideKernel` to consume and expose init-progress and init-error details to callers.
- Update `KernelPort` contract (or add optional event subscription hook) so feature layer can observe init lifecycle without platform coupling.

Acceptance criteria:
- During kernel startup, consumer can receive ordered progress events.
- On startup failure, consumer can access user-displayable error summary/detail, not just a boolean failure.

### 3) Wire runtime orchestration to dispatch progress and detailed errors

Affected files:
- `src/features/notebook/hooks/useTabNotebookRuntime.ts`
- `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx`

Steps:
- In `initKernelForTab`, subscribe to kernel init progress and dispatch reducer actions for each update.
- On success, finalize status/detail to ready state.
- On failure, dispatch error status plus captured init error details.
- Ensure generation guards still prevent stale updates after restart/dispose.

Acceptance criteria:
- Active tab receives live init progress updates.
- Restart/dispose paths do not leak stale progress/error updates from prior generations.
- Hook tests cover success, failure, and restart edge cases.

### 4) Build interactive loading/error banner UI with retry affordance

Affected files:
- `src/features/notebook/ui/NotebookPage.tsx`
- `src/index.css`
- Optional extraction: `src/features/notebook/ui/KernelLoadingBanner.tsx` (if componentization improves readability/testability)

Steps:
- Replace static loading/error strings with a richer banner/card:
  - loading: step label, spinner/progress indicator, optional elapsed text,
  - error: concise message, optional expandable technical details.
- Add retry control that triggers kernel restart flow for the current tab.
- Keep toolbar indicator behavior intact; avoid regressions to layout/welcome mode.

Acceptance criteria:
- While loading, users can see which step the kernel is on.
- On failure, users can see error details and retry without page reload.
- Banner hides once kernel reaches ready/busy states as appropriate.

### 5) Add/adjust tests for new state and UI behavior

Affected files:
- `src/features/notebook/reducer/notebookReducer.test.ts` (or new reducer tests)
- `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx`
- New/updated UI tests for `NotebookPage` banner behavior

Steps:
- Add reducer tests for init progress and error detail actions.
- Add hook tests for progress dispatch ordering and failure detail propagation.
- Add UI tests validating loading step text, error detail rendering, and retry action dispatch.

Acceptance criteria:
- Tests cover primary happy path and failure/retry path.
- No existing smoke/runtime tests regress.

### 6) Verify and document behavior

Affected files:
- Potential release notes or plan links if repo convention requires (optional)

Steps:
- Run targeted notebook feature tests and full test suite.
- Confirm lint/type checks pass for touched files.
- Capture brief developer note in PR description (outside code) on new kernel-init state and banner behavior.

Acceptance criteria:
- `npm test` and relevant lint/type checks pass.
- Change is reviewable with clear behavior description and risk notes.

## Risks and mitigations

- Risk: worker protocol changes may break if message handling order races with init failure.
  - Mitigation: generation guards plus strict test coverage for sequence ordering.
- Risk: exposing raw error detail may leak noisy internal text.
  - Mitigation: present concise summary by default and gate raw details behind disclosure UI.
- Risk: wider type changes across `KernelPort` consumers.
  - Mitigation: use optional callbacks/events with backward-compatible defaults.
