## Solution Proposals

Context:
- Request: make Stop halt current execution without reloading/restarting the kernel.
- Research Source: `research/2026-05-07-stop-without-kernel-reload-research.md`

Proposal 1 — Add true kernel interrupt path (preferred)
- Overview: Extend `KernelPort`, runtime controller, and Pyodide worker protocol with an explicit interrupt action used by Stop. Keep the existing kernel instance alive, clear queued/pending cells, and avoid calling kernel init/restart lifecycle.
- Key Changes:
  - Add `interrupt()` to `KernelPort` and implement it in `PyodideKernel`.
  - Extend worker inbound protocol with `interrupt` and handle it in `kernel.worker.js`.
  - Add runtime-level `interruptKernelForTab(tabId)` helper and migrate `useCellRunner.stopExecution` to call it instead of dispose+init.
  - Ensure notebook state transitions set kernel status back to ready after interrupt completion and preserve outputs for non-running cells.
- Trade-offs:
  - Pros: matches user expectation; no startup banner flicker; keeps kernel/session state.
  - Cons: interrupt support in browser worker/Pyodide can be environment-sensitive and may require a graceful fallback for unsupported contexts.
- Validation:
  - Unit tests for `useCellRunner` stop path (no `initKernelForTab` call; uses interrupt).
  - Runtime/controller tests for interrupt helper.
  - Manual verification with long-running cell and post-stop immediate re-run.
- Open Questions:
  - Which interrupt mechanism is reliable in this sandboxed runtime (and what fallback policy should be used if unavailable)?

Proposal 2 — UI-level stop without kernel restart (generation-based cancel only)
- Overview: Keep current generation-bump + queue-clear behavior but remove dispose/init. Mark running cell as stopped and set notebook status to ready immediately.
- Key Changes:
  - Remove `r.kernel?.dispose()` and `runtime.initKernelForTab(tid)` from `stopExecution`.
  - Dispatch kernel status transitions so UI unlocks quickly.
- Trade-offs:
  - Pros: minimal code change; no loading banner/restart cycle.
  - Cons: does not actually interrupt in-flight Python; infinite/long executions can still block the worker and make future runs unreliable.
- Validation:
  - Existing stop tests updated for no re-init.
  - Manual checks for a fast-running cell cancellation case.
- Open Questions:
  - Is a non-interrupting "stop" acceptable if old execution may keep running in background?

Chosen proposal: **Proposal 1 — Add true kernel interrupt path** (best aligns with product semantics and avoids hidden execution continuing after Stop).

