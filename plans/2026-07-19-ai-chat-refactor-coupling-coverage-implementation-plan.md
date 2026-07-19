# Plan: AI Chat refactor — loose coupling, high cohesion, test coverage

## Context

AI Chat already ships (left panel + `open_investigator` + cell tools). This plan refactors that slice for clearer boundaries and complete unit/RTL coverage. It does **not** add `run_cell`, chat KV persistence, real token streaming, or workspace chat tabs.

Research: `research/2026-07-19-ai-chat-refactor-coupling-coverage-research.md`  
Proposals: `research/2026-07-19-ai-chat-refactor-coupling-coverage-proposals.md`  
**Chosen:** Proposal 1 — injected tool executor + session hook + dead-path cleanup + full tests.

## Requirements

- [ ] Agent tool loop has no hard dependency on notebook mutation code (inject executor).
- [ ] Notebook cell tools remain a cohesive authoring module; magic parsers imported via public feature barrels.
- [ ] Chat session orchestration lives outside the Capra view component.
- [ ] HTTP `fetch` for chat turns is owned by the composition-root adapter (feature keeps parse + tool defs).
- [ ] Chat does not import `ai-riptide` solely for the agent path string.
- [ ] Unused workspace `TabKind: 'chat'` / link APIs removed (or fully unused paths deleted) so model matches product UX.
- [ ] Colocated tests cover parse, loop edge cases, all tools, adapter, session/UI, left-panel mode.
- [ ] Existing per-cell Riptide / Suggest Fix unchanged; product behavior of left-panel chat writing to active notebook preserved.
- [ ] Developer docs updated to match the post-refactor boundaries (providers, ports, file map, tool-loop ownership).

Non-goals: e2e staging AI Chat, linked-notebook pin, MCP, auto-run cells, chat persistence.

## Architecture (target)

```
AiChatTab (view)
    └─ useAiChatSession ──► AiAgentChatService (port)
              │                    ▲
              │                    │ app/openInvestigatorChatAdapter
              │                    │   (fetch + postOpenInvestigatorTurn)
              ▼
        runChatToolLoop(executeTool)
              │
              ▼
        executeNotebookTool / NOTEBOOK_CELL_TOOLS
              │
              ▼
        workspace dispatch + cribl-* barrel parsers
```

## Key changes

| Component | Change |
|-----------|--------|
| `toolLoop.ts` | Inject `executeTool` (+ summary helper optional) |
| `notebookCellTools.ts` | Barrel imports; keep sync/append/execute |
| `useAiChatSession.ts` | New hook; thin `AiChatTab` |
| `agentNdjson.ts` / adapter | Split parse (feature) vs post (app) |
| Agent path constant | Shared / domain or duplicated once in ports/domain |
| `tabWorkspace.ts` | Remove unused chat tab kind + actions |
| Tests | Expand unit/RTL coverage at each seam |
| Docs | ARCHITECTURE / NAVIGATE / riptide-api (+ AGENTS/CLAUDE pointers if needed); mark prior greenfield plan historical |

---

## Sub-tasks

### Task 1 — Decouple tool loop from notebook tools

**Goal:** `runChatToolLoop` accepts an injectable executor.

**Affected:** `src/features/ai-chat/toolLoop.ts`, `toolLoop.test.ts`, callers (`AiChatTab` / future hook).

**Acceptance:**
- Loop signature includes `executeTool: (call: AgentToolCall) => string` (and may take `summarizeTool` or keep summary in caller).
- No import of `notebookCellTools` from `toolLoop.ts`.
- Existing happy-path test passes with a mock executor; add tests for max rounds and AbortSignal.

### Task 2 — Cohesive notebook cell tools + barrel imports

**Goal:** Authoring module only cares about workspace + validated cell sources.

**Affected:** `src/features/ai-chat/notebookCellTools.ts`, `notebookCellTools.test.ts`; ensure `@features/cribl-api` barrel exports `parseCriblApiMagic` if missing.

**Acceptance:**
- Imports use `@features/cribl-search` and `@features/cribl-api` barrels (no deep magic paths).
- Tests cover: `set_notebook_title`, `create_markdown_cell`, `create_python_cell` (reject `%%cribl_`), `create_search_cell`, `create_api_cell`, `create_lookup_cell` (save/load/delete + invalid), unknown tool, Welcome→notebook, insert-after-selection, sync double-apply.

### Task 3 — Extract `useAiChatSession` + thin UI

**Goal:** High-cohesion session logic; presentational `AiChatTab`.

**Affected:** `src/features/ai-chat/hooks/useAiChatSession.ts` (new), `ui/AiChatTab.tsx`, `index.ts` exports if needed.

**Acceptance:**
- Hook owns: availability, sessionId, api/ui messages, draft/busy/streaming, send/clear/stop, wires `syncWorkspaceDispatch` + `runChatToolLoop` with `executeNotebookTool`.
- `AiChatTab` renders props/hook state with Capra controls; no tool-loop logic inline.
- RTL tests: unavailable banner; send with mock chat adds user bubble + assistant/tool; Clear resets; Stop aborts.

### Task 4 — HTTP ownership + agent path constant

**Goal:** Feature does not own `fetch`; chat does not depend on `ai-riptide` for path.

**Affected:** `agentNdjson.ts`, `app/openInvestigatorChatAdapter.ts`, optionally `domain/` or shared constant used by `riptideService.ts` + chat; `ai-riptide` import graph.

**Acceptance:**
- `parseAgentNdjsonBody` (+ timeouts/constants as needed) remain testable without network.
- Adapter performs POST (inline or via helper living under `app/`).
- One shared `OPEN_INVESTIGATOR_AGENT_PATH` (name TBD) used by both one-shot and chat clients.
- Unit test for adapter with mocked `fetch` (success + not-registered error).

### Task 5 — Remove unused workspace chat tab model

**Goal:** Workspace model matches left-panel product (no phantom `TabKind: 'chat'`).

**Affected:** `tabWorkspace.ts`, `tabWorkspace.test.ts`, any filters in `NotebookPage.tsx` / Toolbar `chat` variant if only for dead tabs.

**Acceptance:**
- `TabKind` is `'welcome' | 'notebook'` only (unless Toolbar `variant: 'chat'` still needed for left-panel mode — keep UI variant separately from TabKind).
- `createChatTab`, `SET_CHAT_LINK`, `linkedNotebookTabId` removed.
- Tests updated; no production references remain (`rg` clean).

### Task 6 — Left panel + page wiring tests

**Goal:** Mode switching and composition seams covered without mocking away the panel.

**Affected:** `WorkspaceLeftPanel` tests (new or extend), `NotebookPage.test.tsx` as needed, `useLeftPanelLayout` if mode persistence is added (only if already present—do not add persistence in this plan unless trivial).

**Acceptance:**
- Selecting “AI Chat” / “Notebooks” toggles `aria-selected` / `hidden` on panels.
- Chat panel remains mounted when switching modes (assert presence in DOM while hidden).

### Task 7 — Documentation update + barrel polish

**Goal:** Developer-facing docs describe the post-refactor AI Chat boundaries (loose coupling, ownership, entry files). Code barrel stays a thin public surface.

**Affected docs (must update):**

| Doc | What to update |
|-----|----------------|
| `docs/ARCHITECTURE.md` | Provider nesting mermaid + prose: include `AiChatProvider` / `useAiChatService` next to `AiCodeProvider`. Feature table for `ai-chat/`: `useAiChatSession`, injected `runChatToolLoop(executeTool)`, `notebookCellTools`, adapter ownership. Port table: `AiAgentChatService` vs `AiCodeService`. Note workspace tabs are `welcome` \| `notebook` only (no `TabKind: 'chat'`). |
| `docs/NAVIGATE.md` | Provider mermaid includes `AiChatProvider`. Feature row for `ai-chat/`: entry files after refactor (`hooks/useAiChatSession.ts`, `ui/AiChatTab.tsx`, `toolLoop.ts`, `notebookCellTools.ts`, `agentNdjson.ts` parse-only; adapter `app/openInvestigatorChatAdapter.ts`). |
| `docs/riptide-api.md` | Clarify dual clients on same agent: one-shot Riptide (`tools: []`) vs AI Chat tool loop. Document injectable client tool loop, max rounds, active-notebook target, HTTP in composition-root adapter, shared agent path constant. File map rows match new locations. |
| `plans/2026-07-19-ai-chat-tab-open-investigator-implementation-plan.md` | Add a short **Superseded** note at top pointing to this refactor plan (left-panel shipped; workspace chat-tab approach abandoned). Do not rewrite the old checklist. |

**Optional (only if they still claim outdated structure):**

| Doc | When |
|-----|------|
| `AGENTS.md` / `CLAUDE.md` | If they omit `AiChatProvider` or still describe AI as one-shot only — add one-line pointers to `ai-chat/` + `docs/riptide-api.md`. |
| `docs/E2E_STAGING.md` | Only if mentioning AI Chat coverage; note e2e remains out of scope for this refactor (no new e2e requirement). |

**Affected code surface:** `src/features/ai-chat/index.ts` — export only what other slices need (`AiChatTab`, types as required).

**Acceptance:**
- [ ] `ARCHITECTURE.md` provider diagram and port/feature sections mention `AiChatProvider` + `AiAgentChatService` and the injected tool-loop / adapter split.
- [ ] `NAVIGATE.md` entry-file map matches the refactored `ai-chat/` layout (session hook, thin UI, parse vs adapter).
- [ ] `riptide-api.md` documents chat tool loop ownership (adapter HTTP, feature parse + tools, loop executor injection) and that cells write to the **active** notebook.
- [ ] Prior greenfield plan marked superseded; this file remains the active checklist.
- [ ] No doc still describes AI Chat as a workspace `TabKind: 'chat'` tab or claims chat is unimplemented.
- [ ] Public barrel does not re-export internal HTTP helpers that moved to `app/`.

### Task 8 — Validation pass

**Acceptance:**
- `npm test` green (at least ai-chat + notebook reducer/page/left-panel related).
- `npm run lint` green.
- Docs spot-check: ARCHITECTURE / NAVIGATE / riptide-api agree with code after Tasks 1–7.
- Manual: left-panel chat still creates cells into active notebook when AI available (staging optional).

---

## Documentation checklist (rollup)

Use with Task 7; verify again in Task 8.

- [ ] `docs/ARCHITECTURE.md` — providers, ports, `ai-chat/` layering after refactor
- [ ] `docs/NAVIGATE.md` — mermaid + entry files
- [ ] `docs/riptide-api.md` — dual clients, tool loop, adapter ownership, active notebook
- [ ] Supersede note on `plans/2026-07-19-ai-chat-tab-open-investigator-implementation-plan.md`
- [ ] `AGENTS.md` / `CLAUDE.md` touch-ups only if still inaccurate
- [ ] `ai-chat` public barrel matches documented surface

---

## Ordering / blockers

1 → 2 can parallelize after 1’s signature lands.  
3 depends on 1 (+ uses 2).  
4 can parallelize with 1–2.  
5 independent (do before or after 3; update NotebookPage filters).  
6 after 3/5 stabilize UI contracts.  
7 after structural changes (docs must reflect final file names / ownership).  
8 last (includes docs spot-check).

## Testing plan summary

| Layer | Focus |
|-------|--------|
| Unit | NDJSON, loop (inject/mock), all cell tools, adapter fetch |
| RTL | `AiChatTab` / hook via provider mock; left panel tabs |
| Regression | Riptide one-shot tests still pass; NotebookPage smoke |

## Open questions (resolved for this plan)

- **Linked notebook:** keep writing to **active** notebook; do not revive `linkedNotebookTabId` in this refactor.
- **e2e:** out of scope unless a follow-up asks for staging AI Chat coverage.
