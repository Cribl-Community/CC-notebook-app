# Research — AI Chat refactor (loose coupling, high cohesion, test coverage)

Query: Refactor the shipped AI Chat (`open_investigator` + notebook cell tools) for loose coupling and high cohesion; update test coverage. Inspiration: [jupyterlite/ai](https://github.com/jupyterlite/ai) registry-style tools. Prior greenfield research (`research/2026-07-19-ai-chat-tab-open-investigator-research.md`) is obsolete for “does chat exist?”.

## High-level summary

AI Chat already ships as a left-panel mode (`library` | `chat`) that calls `POST …/ai/q/agents/open_investigator` with client tools and inserts markdown / Python / Cribl magic cells into the active notebook. Hexagonal ports exist (`AiAgentChatService` vs one-shot `AiCodeService`), but the `ai-chat` slice has cohesion and coupling debt: the agent tool loop hard-wires notebook mutations; cell tools deep-import sibling magic parsers and the workspace reducer; the chat UI owns session + React sync (`flushSync`) + HTTP-adjacent helpers; unused workspace `TabKind: 'chat'` / `linkedNotebookTabId` remain. Unit tests cover NDJSON parse, a happy-path tool loop, and several cell writers; gaps include UI RTL, adapter/provider, abort/max-rounds, lookup/title tools, and left-panel mode switching.

## Detailed findings

### 1) What exists today (product spine)

- Left panel: `WorkspaceLeftPanel` modes `library` | `chat` (`src/features/notebook/ui/WorkspaceLeftPanel.tsx:3-17`); both bodies stay mounted.
- Chat UI: `AiChatTab` (`src/features/ai-chat/ui/AiChatTab.tsx:40-254`) — messages, Clear/Stop, composer; props are `targetNotebookTitle`, `workspaceRef`, `dispatch`.
- Port: `AiAgentChatService` (`src/ports/AiAgentChatService.ts:42-53`) — `isAvailable` + `runAgentTurn`.
- Adapter / provider: `src/app/openInvestigatorChatAdapter.ts`, `src/app/providers/AiChatProvider.tsx`; nested in `App.tsx` under `AiCodeProvider`.
- Tool defs + preamble: `src/features/ai-chat/tools.ts:3-110`.
- Tool → notebook: `executeNotebookTool` / `syncWorkspaceDispatch` (`src/features/ai-chat/notebookCellTools.ts:28-250`).
- Loop: `runChatToolLoop` (`src/features/ai-chat/toolLoop.ts:28-111`) — max 8 rounds via `AI_CHAT_MAX_TOOL_ROUNDS`.
- HTTP + NDJSON: `postOpenInvestigatorTurn` / `parseAgentNdjsonBody` (`src/features/ai-chat/agentNdjson.ts:36-156`); agent path from `@features/ai-riptide` (`AI_RIPTIDE_AGENT_PATH`).
- Docs: `docs/riptide-api.md`, NAVIGATE/ARCHITECTURE mention `ai-chat/`; release notes describe left-panel behavior.

### 2) Coupling / cohesion as implemented

| Concern | Observation | Paths |
|--------|-------------|--------|
| Loop ↔ notebook tools | `toolLoop.ts` imports and always calls `executeNotebookTool` | `toolLoop.ts:8-12`, `:82` |
| Tools ↔ magic features | Deep imports of parse helpers (not only barrels) | `notebookCellTools.ts:3-5` → `cribl-api/criblApiMagic`, `cribl-search/criblSearchMagic`, `criblSearchLookupMagic` |
| Tools ↔ workspace | Direct use of `tabWorkspaceReducer`, `ADD_TAB`, `TAB_NOTEBOOK`, `flushSync` | `notebookCellTools.ts:6-38`, `:41-116` |
| UI ↔ workspace | `AiChatTab` takes `MutableRefObject<WorkspaceState>` + `Dispatch<WorkspaceAction>` and builds sync host | `AiChatTab.tsx:16-21`, `:97-107` |
| Feature ↔ HTTP | `postOpenInvestigatorTurn` uses `fetch` inside the feature slice (adapter re-exports it) | `agentNdjson.ts:96-133`; `openInvestigatorChatAdapter.ts` |
| Feature ↔ ai-riptide | Chat NDJSON client imports agent path constant from one-shot slice | `agentNdjson.ts:2` |
| Dead workspace chat tabs | `TabKind: 'chat'`, `createChatTab`, `SET_CHAT_LINK`, `linkedNotebookTabId` exist; `NotebookPage` filters chat tabs from the bar; `AiChatTab` ignores link | `tabWorkspace.ts:6-23`, `:74-82`, `:112-114`, `:217-224`; `NotebookPage` filter comment |
| UI cohesion | Session seeding, abort, streaming UI, tool-host wiring, and Capra markup live in one 255-line component | `AiChatTab.tsx` |

AGENTS.md / ARCHITECTURE: features should use public barrels when importing another slice; composition root owns adapters. ESLint blocks `@platform/*` from features and deep `@features/*` from `app/`, but does **not** block feature→feature deep paths (`eslint.config.js:48-70`, `:79-94`).

### 3) jupyterlite/ai inspiration (external)

jupyterlite/ai separates provider registry, chat UI, and notebook interaction via JupyterLab **command / tool registries** rather than hard-coding cell mutations inside the agent loop. Analog for this repo: inject a tool executor (or small authoring port) into the loop; keep magic validation owned by cribl-* public surfaces; keep HTTP behind `AiAgentChatService`.

### 4) Existing tests

| File | What it covers |
|------|----------------|
| `agentNdjson.test.ts` | Text concat; `tool_calls`; reason-only errors |
| `toolLoop.test.ts` | Mock port: tool then text; cells appear |
| `notebookCellTools.test.ts` | Welcome→notebook; search cell; insert-after; double-apply sync; invalid API |
| `tabWorkspace.test.ts` | Legacy `createChatTab` + `SET_CHAT_LINK` |
| `useLeftPanelLayout.test.ts` | Open/width persistence (not mode) |
| `NotebookPage.test.tsx` | Mocks `AiChatTab` / `useAiChatService` |

### 5) Coverage gaps (factual)

- No RTL tests for `AiChatTab` (unavailable, send/clear/stop, tool bubbles).
- No tests for `postOpenInvestigatorTurn`, `openInvestigatorChatAdapter`, `AiChatProvider`.
- `create_lookup_cell` / `set_notebook_title` lightly or untested in cell-tools suite.
- No max-tool-rounds / abort / timeout tests on `runChatToolLoop`.
- No `WorkspaceLeftPanel` mode-switch tests.
- No e2e for AI Chat (out of scope unless requested).
- Dead-path workspace chat-tab tests do not match product UX (left panel).

### 6) Non-goals observed in prior plan (still accurate)

Prior plan non-goals: MCP, `local_search`, auto-run cells, chat KV persistence, replacing inline Riptide. Those remain separate from a coupling/coverage refactor.
