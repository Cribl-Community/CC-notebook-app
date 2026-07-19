# Solution Proposals — AI Chat tab (`open_investigator` + cell tools)

Context:
- Request: Add a tab with LLM chat using `open_investigator` and tool calls to create notebooks (markdown, Python, all Cribl magic cells). Draw inspiration from [jupyterlite/ai](https://github.com/jupyterlite/ai).
- Research Source: `research/2026-07-19-ai-chat-tab-open-investigator-research.md`

## Proposal 1 — Chat workspace tab + linked notebook (recommended)

- Overview: Add `TabKind: 'chat'` rendered as a Capra chat UI. Each chat session owns a stable `sessionId` and a **linked notebook tab id**. Client tools (`create_markdown_cell`, `create_python_cell`, `create_search_cell`, `create_api_cell`, `create_lookup_cell`, `set_title`, optional `run_cell` later) are declared to `open_investigator` in Cribl `{id,description,schema}` shape; the client executes them by dispatching existing `ADD_CELL` / `UPDATE_SOURCE` / title actions on the linked notebook. First cell-creating tool auto-creates an empty notebook tab if none is linked. UX mirrors jupyterlite’s main-area chat, but mutations go through our reducer instead of JupyterLab commands.
- Key Changes:
  - `tabWorkspace.ts`: extend `TabKind`; chat tab state (messages, sessionId, linkedNotebookTabId, status).
  - New slice `src/features/ai-chat/` (or expand `ai-riptide/`): tool defs, NDJSON tool-loop client, chat UI, hooks.
  - Extend port beyond one-shot `AiCodeService` (new `AiAgentChatPort` or methods) + `app/` adapter using `CRIBL_API_URL`.
  - `NotebookPage` / `NotebookTabs`: open Chat tab; render chat vs notebook vs welcome; kernel skip for chat tabs.
  - System prompt / tool descriptions encoding magic-cell source templates.
- Trade-offs:
  - Benefits: Matches “add a tab”; clear session ownership; tools have a single write target; keeps existing per-cell Riptide untouched; hexagonal layering preserved.
  - Risks: Split attention (chat tab vs notebook tab); need UX to jump to linked notebook when cells appear; `TabKind` churn across chrome/tests.
- Validation: Unit tests for tool schema → reducer effects and tool-loop message assembly; component test for chat send/stream; optional staging smoke when AI available; manual verify magic cells parse via existing parsers.
- Open Questions: Auto-switch to notebook tab on first cell vs split view? Persist chat transcripts to KV? Allow tools to target “active notebook” instead of linked tab?

## Proposal 2 — Docked chat panel on notebook tabs (jupyterlite side-chat)

- Overview: No new `TabKind`. Add a right-hand chat drawer on notebook tabs (like jupyterlite side panel / Copilot). Tools always mutate the **active** notebook. Opening “AI Chat” toggles the drawer; conversation state is keyed by notebook tab id.
- Key Changes:
  - Chat panel component + layout CSS on `nb-editor-shell`.
  - Same tool-loop / `open_investigator` client as Proposal 1.
  - Toolbar or tab-bar toggle; no welcome/chat tab model changes.
- Trade-offs:
  - Benefits: Cells appear in place; closer to jupyterlite side chat; less workspace model change.
  - Risks: Weaker match to “add a tab”; crowded chrome with sidebar + cells + chat; chat competes with Capra density on small viewports; harder to start from empty “build me a notebook” without an open notebook.
- Validation: Same tool-loop tests; layout/responsive checks; ensure drawer does not break CellList focus/keyboard.
- Open Questions: Persist open/closed state? Mobile collapse behavior?

## Recommendation

Choose **Proposal 1**. The request explicitly asks for a tab; a linked notebook gives tools a stable target for “create a notebook from chat,” while still allowing a “Open linked notebook” control. Borrow jupyterlite ideas (streaming chat, stop, tool registry, approval for destructive ops) without adopting Lumino/`@jupyter/chat`.
