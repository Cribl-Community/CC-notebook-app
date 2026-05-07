# Kernel Loading Banner Interactivity Research

## High-level summary

The current notebook UI renders a static "Loading Python kernel…" banner whenever `kernelStatus` is `loading`, and a static error banner when `kernelStatus` is `error`. Kernel lifecycle state transitions are driven by `useTabNotebookRuntime`, which only dispatches coarse status updates (`loading`, `ready`, `error`) around `kernel.ready`; it does not emit intermediate initialization milestones or structured error metadata. The Pyodide worker currently has enough internal initialization boundaries (`importScripts`, `loadPyodide`, bootstrap scripts) to support progress events, but those are not part of the worker protocol today. Error details are available as `init_error.message` from the worker and currently become a rejected `kernel.ready` promise, but this detail is dropped before it reaches reducer/UI state. Existing tests cover tab runtime status dispatch and reducer kernel status handling, but there are no tests specific to an interactive kernel-loading banner.

## Detailed findings

### Notebook loading/error banner rendering

- `NotebookPage` shows loading and error banners based only on `state.kernelStatus`; loading text is fixed and error text is generic.
  - Reference: `src/features/notebook/ui/NotebookPage.tsx:305-311`
- Banner styles are basic (`.nb-loading` and `.nb-loading--error`) with no progress, step list, controls, or detail sections.
  - Reference: `src/index.css:1514-1527`

### Kernel lifecycle and state model

- Notebook model defines `kernelStatus` as `'loading' | 'ready' | 'busy' | 'error'` with no fields for progress stage, percent, elapsed time, or error detail.
  - Reference: `src/features/notebook/model/types.ts:33-42`
- Reducer supports only `SET_KERNEL_STATUS` for kernel lifecycle state; there are no actions for progress updates or initialization diagnostics.
  - Reference: `src/features/notebook/reducer/notebookReducer.ts:243-244`
- Welcome-tab state and empty-tab initialization also only track `kernelStatus`.
  - Reference: `src/features/notebook/reducer/tabWorkspace.ts:18-25`
  - Reference: `src/features/notebook/reducer/tabWorkspace.ts:63-71`

### Runtime orchestration and error handling

- `useTabNotebookRuntime.initKernelForTab` dispatches `loading`, creates a kernel, then dispatches `ready` or `error` based on `kernel.ready` resolution. The catch branch does not capture the thrown error payload for UI state.
  - Reference: `src/features/notebook/hooks/useTabNotebookRuntime.ts:84-110`
- Kernel restart path resets state and re-initializes kernel, making it a natural retry path for banner CTA wiring.
  - Reference: `src/features/notebook/hooks/useTabNotebookRuntime.ts:125-135`
- `useCellRunner` transitions to `busy` during execution and back to `ready` afterward; this is separate from kernel bootstrap and should remain unaffected by init-progress UI changes.
  - Reference: `src/features/notebook/hooks/useCellRunner.ts:86-90`
  - Reference: `src/features/notebook/hooks/useCellRunner.ts:140-144`

### Worker protocol and available progress boundaries

- Worker outbound protocol currently supports: `ready`, `init_error`, `iopub`, `complete_result`, and `fetch_request`; no init-progress event exists yet.
  - Reference: `src/platform/pyodide/types.ts:144-154`
- Worker init sequence has clear serial steps (`importScripts`, `loadPyodide`, env setup, completion bootstrap, package bootstrap, run bootstrap) where progress events can be emitted.
  - Reference: `src/platform/pyodide/kernel.worker.js:293-311`
- Worker emits `init_error` with a message when initialization fails.
  - Reference: `src/platform/pyodide/kernel.worker.js:312-314`
- Main-thread `PyodideKernel` converts worker `init_error` into rejected `ready` promise with message, but does not persist intermediate status or failure detail for consumers beyond the promise rejection.
  - Reference: `src/platform/pyodide/PyodideKernel.ts:55-60`
  - Reference: `src/platform/pyodide/PyodideKernel.ts:64-70`

### Existing related UX patterns

- Toolbar already has a kernel indicator (`Loading…`, `Ready`, `Busy`, `Error`) but no richer detail view.
  - Reference: `src/features/notebook/ui/Toolbar.tsx:27-49`
- `PyodideSmokeTest` demonstrates UI pattern for phase/status-driven messaging and error detail rendering, which can inform interactive loading banner design.
  - Reference: `src/PyodideSmokeTest.tsx:78-116`
  - Reference: `src/PyodideSmokeTest.tsx:142-149`

### Test coverage baseline

- Runtime hook tests assert kernel init dispatches loading and that restart re-inits/disposes; these tests can be extended for progress/error-detail dispatching.
  - Reference: `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx:39-60`
  - Reference: `src/features/notebook/hooks/useTabNotebookRuntime.test.tsx:62-89`
- No `NotebookPage` tests currently validate banner text/state combinations.
  - Reference: `src/features/notebook/ui` (no matching `NotebookPage` tests)
