# Plan: AI Chat tab (`open_investigator` + notebook cell tools)

> **Superseded.** AI Chat shipped as a **left-panel** mode (not a workspace `TabKind: 'chat'`).
> For the coupling/cohesion refactor and current architecture, see
> [`plans/2026-07-19-ai-chat-refactor-coupling-coverage-implementation-plan.md`](./2026-07-19-ai-chat-refactor-coupling-coverage-implementation-plan.md).
> This file is kept as historical design notes only.

## Context

Users want a multi-turn LLM chat that can **author notebooks** (markdown, Python, `%%cribl_search` / `%%cribl_api` / lookup magics) via Cribl agent tool calls. Today AI is one-shot cell codegen with `tools: []`. Live API supports client tools on `open_investigator`. Inspiration: [jupyterlite/ai](https://github.com/jupyterlite/ai) chat + tool registry (adapted to our reducer).

Research: `research/2026-07-19-ai-chat-tab-open-investigator-research.md`  
Proposals: `research/2026-07-19-ai-chat-tab-open-investigator-proposals.md`  
**Chosen:** Proposal 1 — Chat workspace tab + linked notebook.

## Requirements

- [ ] New workspace tab for LLM chat (not Welcome / not CellList).
- [ ] Multi-turn chat against `POST …/ai/q/agents/open_investigator` with stable `sessionId`.
- [ ] Client tools create markdown, Python, and magic code cells on a linked notebook tab.
- [ ] Stream assistant text into the chat; execute `tool_calls` locally; continue loop with `role: "tool"`.
- [ ] Unavailable outside Cribl AI (same gate as `AiCodeService.isAvailable()`).
- [ ] Existing per-cell Riptide / Suggest Fix unchanged.
- [ ] Unit tests for tool loop + cell writers; docs updated (`riptide-api.md`, NAVIGATE/ARCHITECTURE briefly).

Non-goals (v1): MCP servers, `local_search` Investigation agent, auto-run cells, chat KV persistence, replacing inline Riptide.

## Design

### Architecture

```
Chat tab UI ──► useAiChatSession ──► AiAgentChatPort (port)
                      │                      │
                      │                      ▼
                      │              open_investigator NDJSON
                      │              (tools: notebook cell schemas)
                      ▼
              NotebookCellTools (executors)
                      │
                      ▼
              dispatchNotebook / ADD_TAB (linked notebook)
```

Tool request shape (Cribl):

```ts
{ id: string; description: string; schema: object }
```

### Tool catalog (v1)

| id | Effect |
|----|--------|
| `set_notebook_title` | `SET_TITLE` / tab meta on linked notebook |
| `create_markdown_cell` | `ADD_CELL` markdown + source |
| `create_python_cell` | `ADD_CELL` code + Python source |
| `create_search_cell` | code cell: `%%cribl_search …\n` + query |
| `create_api_cell` | code cell: `%%cribl_api METHOD path …\n` + YAML body |
| `create_lookup_cell` | code cell: save/load/delete lookup magic + args |

Optional later: `list_notebook_outline`, `update_cell`, `delete_cell` (approval), `run_cell`.

Each tool returns a short JSON summary (`cellId`, `index`) for the model.

### Chat message model (client)

Keep parallel structures:

1. **UI messages** — user / assistant (streamed) / tool status chips.
2. **API messages** — what we POST (user, assistant with `tool_calls` and `content: ""`, tool with `tool_call_id`).

### Key files

| Area | Paths |
|------|--------|
| Tab model | `src/features/notebook/reducer/tabWorkspace.ts`, tests |
| Page chrome | `NotebookPage.tsx`, `NotebookTabs.tsx`, `useNotebookPageTabChrome.ts` |
| Port | `src/ports/AiAgentChatService.ts` (new), `ports/index.ts` |
| Adapter | `src/app/openInvestigatorChatAdapter.ts` (new) |
| Provider | extend `AiCodeProvider` or add `AiChatProvider` in `App.tsx` |
| Feature | `src/features/ai-chat/` — `tools.ts`, `toolLoop.ts`, `chatSession.ts`, `ui/AiChatTab.tsx`, `index.ts` |
| Extend Riptide parse | `ai-riptide/riptideService.ts` or shared NDJSON parser for `tool_calls` |
| Docs | `docs/riptide-api.md`, `docs/NAVIGATE.md`, `docs/ARCHITECTURE.md` |
| Release notes | `src/features/welcome/releaseNotes.ts` (when shipping) |

### CSS / UX

- Chat layout inside `nb-editor-shell`: message list + composer; Capra inputs/buttons; reuse `--nb-*` tokens.
- Header: “Open linked notebook”, clear chat, stop generation.
- When chat unavailable: same empty-state pattern as AI button disabled outside Cribl.

## Sub-tasks (ordered)

### Task 1 — Tab model: `kind: 'chat'`

Acceptance:
- `TabKind` includes `'chat'`; `createChatTab()` factory; chat tabs skip `TAB_NOTEBOOK` mutations and kernel (like welcome).
- Tab bar shows chat title (e.g. “AI Chat”); close/select work.
- Plus menu or dedicated control can open a chat tab (at least one entry point: toolbar or Welcome CTA).

Affected: `tabWorkspace.ts`, `tabWorkspace` tests, `NotebookTabs.tsx` / chrome hooks, `NotebookPage.tsx` branch.

### Task 2 — NDJSON agent client + tool loop

Acceptance:
- Shared helper parses NDJSON lines for `content` fragments **and** `tool_calls`.
- `runAgentTurn({ apiBase, sessionId, messages, tools, signal })` posts to `open_investigator`, streams, returns `{ assistantText, toolCalls, rawAssistantMessage }`.
- Loop: while toolCalls — execute locally — append assistant (`content: ''`) + tool results — re-POST until text-only or max steps (e.g. 8).
- Errors surface as chat system messages; abort via `AbortController`.

Affected: `src/features/ai-chat/toolLoop.ts` (or `ai-riptide/agentNdjson.ts`), unit tests with fixture NDJSON.

### Task 3 — Notebook cell tool definitions + executors

Acceptance:
- Export Cribl tool schemas for the catalog above.
- Executors ensure linked notebook exists (`ADD_TAB` + link), then dispatch structure actions; validate search/api/lookup source with existing parsers where cheap (`looksLike*` / `parse*`) and return error payload to the model if invalid.
- System/developer preamble documents magic formats (few-line examples).

Affected: `src/features/ai-chat/tools.ts`, `notebookCellTools.ts`, tests.

### Task 4 — Port + adapter + provider

Acceptance:
- New port method(s) e.g. `chatTurn(...)` / `isAvailable()` without bloating one-shot `AiCodeService` (prefer separate port).
- Adapter uses env `CRIBL_API_URL` like `riptideAiCodeAdapter`.
- Wired in `App.tsx` providers.

Affected: `src/ports/`, `src/app/`, `App.tsx`, `providers/index.ts`.

### Task 5 — Chat UI tab

Acceptance:
- `AiChatTab` renders message list, streaming assistant, tool activity (“Created search cell…”), composer, Stop, Clear, Open notebook.
- Entry: Welcome “AI Chat” and/or toolbar button → `ADD_TAB` chat.
- Disabled/unavailable state when AI APIs missing.

Affected: `src/features/ai-chat/ui/*`, `WelcomePage.tsx` (CTA), `NotebookPage.tsx`, styles.

### Task 6 — Docs + smoke tests + release note stub

Acceptance:
- `docs/riptide-api.md` documents Cribl tool shape, tool loop, and chat client.
- NAVIGATE/ARCHITECTURE mention `ai-chat` slice and chat tab kind.
- Vitest coverage for tools + loop; App/page smoke still passes.
- Prepend release-notes bullet when ready to ship (can be same PR or follow-up).

## Testing plan

- Unit: NDJSON with tool_calls; loop with mock `fetch`; each tool → expected `NotebookAction`s; invalid magic returns tool error JSON.
- RTL: send message shows user bubble; mock port streams tool then text.
- Manual (Cribl tenant): “Build a notebook that searches cribl_search_sample and plots bytes” → markdown + search + python cells on linked tab.

## Rollout

- Ship behind natural availability gate (`isAvailable`); no feature flag required unless desired.
- Rollback: remove chat entry points / tab kind (or leave tab kind unused).

## Open questions (defaults for plan)

1. **Focus after tool write:** default = keep chat focused; toast/link “Opened in Notebook”.
2. **Chat persistence:** v1 in-memory per tab only.
3. **Max tool rounds:** 8.
4. **Destructive tools:** omit delete/update in v1.
