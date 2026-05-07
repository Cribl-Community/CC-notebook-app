# Research: Stop Execution Without Kernel Reload

## High-level summary

The current Stop flow in the notebook feature is implemented as a full kernel recycle, not an interrupt-in-place. `Toolbar` wires Stop to `useCellRunner.stopExecution`, and that handler disposes the active kernel and calls `initKernelForTab` to start a new one. The runtime/controller APIs currently expose restart and dispose primitives, but no interrupt primitive on `KernelPort` or the worker protocol. The Pyodide adapter supports only `init`, `exec`, `complete`, and fetch bridge messages, so there is no message-level cancellation path for an in-flight execution. Existing tests and release notes codify this behavior, including language that Stop interrupts and restarts.

## Detailed findings

### 1) UI wiring and current Stop semantics

- Stop button is described as interrupting and tied directly to `onStop`.
  - `src/features/notebook/ui/Toolbar.tsx:137-145`
- `NotebookPage` injects `stopExecution` from `useCellRunner` as `onStop`.
  - `src/features/notebook/ui/NotebookPage.tsx:153-154`
  - `src/features/notebook/ui/NotebookPage.tsx:291-293`

### 2) Stop handler currently performs kernel disposal + re-init

- `stopExecution` bumps generation, clears pending queue, disposes `r.kernel`, resets run queue, and then calls `runtime.initKernelForTab(tid)`.
  - `src/features/notebook/hooks/useCellRunner.ts:194-232`
- The inline comment in that method explicitly documents this as disposing old kernel then spinning up a fresh one.
  - `src/features/notebook/hooks/useCellRunner.ts:207-211`

### 3) Runtime lifecycle APIs do not expose interrupt-only operation

- `TabRuntimeController` exposes `initKernelForTab`, `restartKernelForTab`, `resetQueueState`, and `disposeTab`, but no `interruptKernelForTab`.
  - `src/features/notebook/hooks/useTabNotebookRuntime.ts:31-49`
- Restart path dispatches `RESTART` and then calls `initKernelForTab`, which is the same loading lifecycle family Stop currently leverages indirectly.
  - `src/features/notebook/hooks/useTabNotebookRuntime.ts:161-171`

### 4) Kernel abstraction and worker protocol lack interrupt message

- `KernelPort` interface includes `ready`, `execute`, `complete`, and `dispose`; no `interrupt` method exists.
  - `src/ports/KernelPort.ts:21-38`
- Worker inbound message union includes only `init`, `exec`, `complete`, and `fetch_response`.
  - `src/platform/pyodide/types.ts:119-143`
- Worker handler processes `init`, `complete`, and `exec`; no interrupt branch exists.
  - `src/platform/pyodide/kernel.worker.js:297-451`
- Main-thread adapter only terminates worker via `dispose()` for cancellation-like behavior.
  - `src/platform/pyodide/PyodideKernel.ts:249-260`

### 5) Existing behavior is reflected in tests and release notes

- Unit test currently asserts `stopExecution` re-initializes kernel (`initKernelForTab` called).
  - `src/features/notebook/hooks/useCellRunner.test.tsx:176-206`
- Release notes explicitly describe Stop as interrupt + restart.
  - `src/features/welcome/releaseNotes.ts:119-121`

