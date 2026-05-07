# Design Doc: Stop Execution Without Kernel Reload

## Context
Today, pressing Stop disposes and re-initializes the tab kernel, which causes loading-state churn and drops in-memory kernel session continuity. The goal is to make Stop interrupt only the active execution path while keeping the same kernel instance alive.

## Requirements
- [ ] Pressing Stop interrupts active execution without calling kernel re-init/restart paths.
- [ ] Pending queued cells are still cancelled and returned to idle.
- [ ] Running cell surfaces a clear "stopped" outcome without full-kernel reload banner.
- [ ] If interrupt cannot be performed in the environment, behavior degrades predictably and is observable to the user.
- [ ] Existing restart behavior remains unchanged.

## Research Summary
- Source: `research/2026-05-07-stop-without-kernel-reload-research.md`
- Current Stop implementation in `useCellRunner` disposes kernel + `initKernelForTab`.
- Kernel abstraction (`KernelPort`) and worker protocol have no interrupt primitive.

## Chosen Approach
Implement a first-class interrupt pipeline (port -> adapter -> worker -> runtime -> hook) and migrate Stop to use it. Keep restart as the only path that performs dispose+fresh init.

## Design

### Architecture
Add an interrupt control channel to the existing per-tab kernel runtime so Stop acts on the currently attached kernel instance rather than recycling it.

### Key Changes
| Component | Change | Notes |
|-----------|--------|-------|
| `src/ports/KernelPort.ts` | Add `interrupt(): Promise<void>` to contract | Allows feature layer to request execution interruption without dispose |
| `src/platform/pyodide/types.ts` | Extend `WorkerInbound` with interrupt message | Preserves typed worker protocol |
| `src/platform/pyodide/PyodideKernel.ts` | Implement `interrupt()` by posting interrupt command and resolving/rejecting by worker ack/error | Include capability/fallback handling |
| `src/platform/pyodide/kernel.worker.js` | Handle interrupt command and trigger Pyodide interruption mechanism | Must avoid breaking init/exec paths |
| `src/features/notebook/hooks/useTabNotebookRuntime.ts` | Add `interruptKernelForTab(tabId)` helper on controller | Keep lifecycle concerns centralized |
| `src/features/notebook/hooks/useCellRunner.ts` | Replace Stop dispose+init flow with interrupt flow + queue cleanup | Ensure status and running cell are updated |
| Tests (`useCellRunner`, runtime, adapter/worker protocol tests) | Update and add interrupt-specific assertions | Protect regression to restart behavior |
| `src/features/welcome/releaseNotes.ts` | Update Stop wording to no-reload semantics | User-facing behavior note |

### Data Model
No persisted notebook schema changes required. Optional transient runtime flags may be added if needed for interrupt-in-flight gating.

### API Changes
No external network/API changes. Internal contract changes:
- `KernelPort` interface gains `interrupt()`.
- Worker message union gains `interrupt` control message (and optional ack/error outbound if needed).

## Testing Plan
- Unit tests:
  - `useCellRunner.stopExecution` asserts interrupt is invoked and `initKernelForTab` is not called.
  - Runtime helper test for `interruptKernelForTab`.
  - Adapter-level tests for interrupt request dispatch and completion handling.
- Integration-ish UI test:
  - Stop from busy state does not trigger loading banner transition tied to kernel re-init.
- Manual verification:
  - Run long cell, hit Stop, confirm execution halts and kernel remains usable immediately.
  - Confirm Restart still performs full reset/re-init.
  - Validate fallback messaging if interrupt is unavailable in environment.

## Rollout
- Ship behind normal release process (no migration needed).
- If fallback path is required, log and surface concise user message to aid debugging.
- Rollback: revert Stop path to prior dispose+init logic.

## Open Questions
- [ ] Which interrupt primitive is stable in the sandboxed worker runtime for this app target?
- [ ] Should fallback behavior silently degrade or always show a non-blocking warning when true interrupt is unavailable?

## Ordered Sub-Tasks
1. **Kernel contract + worker protocol**
   - Add interrupt contract and worker message types; wire adapter interrupt request/response handling.
2. **Runtime interrupt API**
   - Add runtime controller helper to interrupt active tab kernel without dispose/init.
3. **Stop flow migration**
   - Refactor `useCellRunner.stopExecution` to use interrupt helper while preserving queue/pending/running-cell semantics.
4. **Tests and behavior docs**
   - Update existing tests and add interrupt-path coverage; update release notes text.
5. **Manual validation pass**
   - Validate stop/restart behavior in dev flow and confirm no regression in kernel banner lifecycle.

