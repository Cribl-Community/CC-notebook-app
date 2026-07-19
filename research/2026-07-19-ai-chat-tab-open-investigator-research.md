# Research — AI Chat tab via `open_investigator` + cell tools

Date: 2026-07-19  
Query: Add a tab with LLM chat using Cribl `open_investigator` and tool calls to create a notebook (markdown, Python, and Cribl magic cells). Research [jupyterlite/ai](https://github.com/jupyterlite/ai) for inspiration.

## High-level summary

The notebook app has a multi-tab workspace (`welcome` | `notebook`) but **no multi-turn chat UI**. AI today is one-shot: per-cell Riptide prompt and error-fix suggestions call `POST /ai/q/agents/open_investigator` with `tools: []`, a fresh `sessionId` each request, and text/fenced-Python parsing only. Cell creation is already modeled (`ADD_CELL`, `UPDATE_SOURCE`); magic cells are ordinary code cells whose source starts with `%%cribl_search`, `%%cribl_api`, or lookup magics, routed by `executorRegistry`. Live tenant probes (prior session) confirmed `open_investigator` accepts client tools in Cribl shape `{ id, description, schema }` and returns NDJSON `tool_calls`; a client-side tool loop with `role: "tool"` results works when assistant `content` is `""` (not `null`). jupyterlite/ai provides a chat main-area/side panel, a tool registry, and notebook mutation via JupyterLab **command tools** (`discover_commands` / `execute_command`) rather than hard-coded cell APIs.

## Findings by area

### 1. Tab shell and workspace

- `TabKind` is only `'welcome' | 'notebook'` (`src/features/notebook/reducer/tabWorkspace.ts:6-17`).
- Workspace actions: `ADD_TAB`, `CLOSE_TAB`, `SELECT_TAB`, `TAB_NOTEBOOK`, `REPLACE_TAB_CONTENT`, `SET_TAB_META` (`tabWorkspace.ts:53-72`).
- New empty notebook: `createEmptyTab()` → `ADD_TAB` (`tabWorkspace.ts:74-83`; `useNotebookPageTabChrome.ts:48-61`).
- Tab bar UI: `NotebookTabs.tsx:18-61` (`role="tablist"`, select/close, Plus).
- `NotebookPage.tsx` switches Welcome vs `CellList` on `activeTab.kind` (`NotebookPage.tsx:150`, `199-310`).
- Welcome tabs ignore notebook mutations (`tabWorkspace.ts:126-129`).

### 2. Notebook model / cell creation (exists today)

- Cell types: `code` | `markdown` (`src/features/notebook/model/types.ts:12-56`).
- Structure actions include `ADD_CELL` (`afterId?`, `cellType?`), `UPDATE_SOURCE`, `DELETE_CELL`, `LOAD_NOTEBOOK` (`types.ts:93-106`, `143`).
- Reducer `ADD_CELL` inserts/selects (`notebookReducer.ts:64-78`); factories `makeCodeCell` / `makeMarkdownCell` (`notebookReducer.ts:5-23`).
- Toolbar and `CellList` already dispatch `ADD_CELL` (`NotebookPage.tsx:210-211`; `CellList.tsx:72-88`).

### 3. Magic cells (code source conventions)

| Magic | Parser / matcher |
|-------|------------------|
| `%%cribl_search` | `criblSearchMagic.ts:228-236`; executor `criblSearchExecutor.ts:107-112` |
| `%%cribl_api` | `criblApiMagic.ts:183-210`; `criblApiExecutor.ts:24-29` |
| `%%cribl_*_search_lookup` | `criblSearchLookupMagic.ts:160-172` |
| else | `pythonExecutor.matches: () => true` |

Registry order (first match wins): cribl-api → lookup → search → Python (`executorRegistry.ts:71-91`). Creating a “search magic cell” is **`ADD_CELL` code + `UPDATE_SOURCE` with a valid magic header and body** — no separate cell_type.

### 4. AI / Riptide today

- Port `AiCodeService` (`src/ports/AiCodeService.ts:5-17`): `isAvailable`, `generatePythonFromPrompt`, `suggestErrorFix` — **no chat/session/tool-loop API**.
- `riptideService.ts`: path `AI_RIPTIDE_AGENT_PATH = '/ai/q/agents/open_investigator'` (`:9-11`); both generate/fix send `tools: []` and new `sessionId` (`:153-169`, `:250-266`); `parseRiptideNdjsonBody` concatenates text only (`:41-59`).
- Adapter: `src/app/riptideAiCodeAdapter.ts:13-23`; provider `AiCodeProvider`.
- UI: inline AI panel on `CodeCell.tsx:366-410`; fix UI in `CellOutput.tsx`; orchestration `useNotebookPageAiGenerate.ts`.
- Contract doc: `docs/riptide-api.md` documents `tools` and `tool_calls` but states the notebook client does not execute tools (`:59`, `:77`).

### 5. Live API behavior (DevTools probe, same tenant)

Documented in prior investigation (not re-probed in this pass):

- Tool request shape expected by Cribl UI serializer: `{ id, description, schema }` (not OpenAI `{ type, function: { name, parameters } }`).
- `open_investigator` with a client tool returned `tool_calls` (e.g. `get_notebook_var`).
- Tool follow-up succeeded with assistant `content: ""` + `role: "tool"`; `content: null` on assistant echo failed server-side.
- `open_investigate` / `riptide` are **not** registered; Search Investigation uses `local_search` with its own large client tool list.
- Org AI features included `agentic_search` / `web_search`; `leader_mcp` false; MCP servers list empty.

### 6. Composition / layering

- `App.tsx:13-32`: Env → Theme → AiCode → Dialog → Search → Lookup → NotebookRepo → Kernel → `NotebookPage`.
- Features must not import `@platform/*`; cross-feature via barrels (`@features/ai-riptide`, etc.). AI HTTP helpers live in `features/ai-riptide/`; adapters in `app/`.
- No `features/notebook/index.ts` barrel today (deep imports).

### 7. Chat UI patterns in this repo

- **None.** No message list, conversation session, or chat panel under `src/`. Closest patterns: Capra `Modal` dialogs, Welcome scrollable page, inline Riptide prompt, Cribl Search picker modal.

### 8. jupyterlite/ai inspiration ([repo](https://github.com/jupyterlite/ai), [docs](https://jupyterlite-ai.readthedocs.io/))

Observed from upstream sources (README, usage docs, `packages/agent`, `packages/ai`):

- **Chat surfaces**: main-area chat widget (`packages/ai/src/widgets/main-area-chat.ts`) and side-panel chat; can move between areas; save/restore chats; stop while streaming.
- **Agent core** (`@jupyternaut/agent`): provider registry, **tool registry**, skills, optional MCP.
- **Notebook mutation model**: generic JupyterLab command tools — `discover_commands` + `execute_command` (`packages/agent/src/tools/commands.ts`) — rather than a fixed `insert_cell` API. Approval list for sensitive commands (`commandsRequiringApproval`).
- **Usage**: MIME auto-render for command results in chat; tool selection UI (`tool-select.tsx`).
- **Not a drop-in**: depends on JupyterLab/Lumino/`@jupyter/chat`/Vercel AI SDK. This app is a Capra React SPA with its own reducer — **borrow UX/architecture ideas only**, not the package tree.

Relevant parallels for this product:

| jupyterlite/ai | notebook-app analog |
|----------------|---------------------|
| Main-area chat tab | New workspace tab kind or dedicated chat surface |
| Side chat next to notebook | Docked panel beside `CellList` |
| `execute_command` → notebook ops | Client tools → `dispatchNotebook(ADD_CELL / UPDATE_SOURCE)` |
| Tool registry | Explicit Cribl `{id,description,schema}` + local executors |
| Streaming + stop | NDJSON stream + `AbortController` (already used in Riptide) |

## Gaps / constraints (facts)

- Extending `TabKind` requires reducer + `NotebookPage` + tab label + kernel skip (welcome-like) for non-notebook tabs.
- `AiCodeService` does not expose multi-turn messaging or tools.
- Magic cell validity is string-format dependent; invalid magic still creates a code cell that may error at run time.
- No existing e2e coverage for AI chat (staging e2e docs cover Run All / examples; AI may need `@slow` or mocked unit tests).
