# Plan: Multiple notebook tabs, one Pyodide kernel per tab

## Chosen approach

**Workspace-level tab model with per-tab notebook state and per-tab `PyodideKernel` instances.** Inactive tabs stay mounted but hidden so each open tab retains an isolated Python interpreter without re-init on switch. Closing a tab disposes that tab’s kernel.

## Context (research)

- `PyodideKernel` (`src/pyodide/PyodideKernel.ts`) creates one `Worker` per instance, loads Pyodide once per worker, and `dispose()` terminates the worker.
- `NotebookPage` (`src/notebook/NotebookPage.tsx`) uses a single `useReducer(notebookReducer)` and a single `kernelRef`; `genRef` + `runQueueRef` + `execCounterRef` serialize execution and invalidate async work on kernel restart.
- `notebookReducer` / `NotebookState` (`src/notebook/types.ts`, `src/notebook/notebookReducer.ts`) model one notebook; no tab or multi-document concepts.
- KV sidebar uses `activeNotebookId` for save/load; only one “document” is tracked today.

## Sub-tasks (ordered)

### 1. Tab workspace model and types

- Add types for a tab entry: stable `tabId`, embedded `NotebookState`, and fields needed for persistence UX (`lastSavedJson` snapshot, optional `activeNotebookId` for KV linkage, optional display label if title diverges from saved name).
- Decide minimal tab bar metadata (order, dirty flag derived vs stored).

**Acceptance:** Types exported from `src/notebook/` and used by `NotebookPage` (or a new workspace module).

**Files:** Likely `src/notebook/types.ts`, new `src/notebook/tabWorkspace.ts` or similar.

---

### 2. Tab-level actions and reducer (or structured state updates)

- Introduce workspace-level actions: `ADD_TAB` (optionally clone from template or empty), `CLOSE_TAB` (with dirty confirmation), `SELECT_TAB`, optionally `REORDER_TABS`.
- Either nest `NotebookState` inside workspace state and prefix notebook actions with `tabId`, or use a small workspace reducer that delegates to `notebookReducer` for the active tab only.

**Acceptance:** Switching active tab does not mutate other tabs’ `NotebookState`; closing a tab removes its state from memory.

**Files:** New reducer module and/or extensions to `notebookReducer.ts` / `types.ts`.

---

### 3. Per-tab kernel and execution refs

- Replace single `kernelRef` with a `Map<tabId, PyodideKernel>` (or record) created when a tab is added; `dispose()` on tab close.
- Mirror `genRef`, `runQueueRef`, and `execCounterRef` **per tab** so concurrent execution in different tabs does not cross streams (each tab’s `runCell` uses only that tab’s kernel and queue).
- On tab switch: no kernel teardown (kernels stay alive for open tabs); toolbar/kernel status reflects **active** tab only.

**Acceptance:** Run code in tab A, switch to tab B, run different code — variables/state in Python do not mix; returning to tab A preserves interpreter state.

**Files:** `src/notebook/NotebookPage.tsx` (or extracted hooks `useTabKernel.ts`).

---

### 4. UI: tab bar and hidden panels

- Add a horizontal tab strip (JupyterLab-inspired: close button per tab, overflow if many tabs).
- Render each tab’s editor region in a container with `display: none` / `hidden` for non-active tabs so React state and workers remain mounted; only the active tab is visible.
- Wire `Toolbar`, `CellList`, and kernel status banners to **active tab** state and dispatch.

**Acceptance:** Multiple tabs visible in tab bar; content switches instantly without reloading Pyodide for inactive tabs.

**Files:** `src/notebook/NotebookPage.tsx`, new `src/notebook/NotebookTabs.tsx` (optional), `src/index.css` for layout.

---

### 5. Integrate KV save/load with tabs

- **New notebook / new tab:** Creating a new tab should reset that tab’s KV id appropriately (`null` until first save), independent of other tabs.
- **Open from library:** Prefer opening in a **new** tab (or prompt if replacing); set that tab’s `activeNotebookId` and `lastSavedJson` after load.
- **Save:** Use active tab’s `activeNotebookId` + state; update manifest as today.
- **Rename/delete from sidebar:** If rename targets the open tab’s id, update that tab’s title; delete removes tab or resets if policy chosen.

**Acceptance:** Two tabs can refer to two different KV-backed notebooks without cross-contamination.

**Files:** `src/notebook/NotebookPage.tsx`, `src/notebook/NotebookSidebar.tsx` (props callbacks may gain `openInNewTab` vs `replace`).

---

### 6. Persistence of UI preferences (optional, small)

- Replace or extend `localStorage` usage (`nb-notebook-title`) to restore last active tab id and/or tab count policy if desired; avoid blocking MVP.

---

### 7. Tests and manual verification

- Add/extend unit tests for workspace reducer (tab add/close/select, isolated notebook actions).
- Manual: open three tabs, run different variables, verify isolation and memory behavior when closing tabs.

**Files:** `src/notebook/*.test.ts` as appropriate.

---

## Risks and constraints

- **Memory:** Each open tab holds a full Pyodide worker (~tens of MB each). Mitigation: dispose on tab close; document optional future “sleep tab” / lazy kernel init.
- **Build size:** Unchanged for this feature if no new deps; keep existing Pyodide packaging as-is.

## Out of scope (this plan)

- URL routing per tab (could be a follow-up).
- Shared kernel across tabs (explicitly not desired).
