# Solution Proposals — AI Chat refactor (coupling + coverage)

## Solution Proposals

Context:
- Request: Refactor shipped AI Chat for loose coupling / high cohesion; update test coverage. Keep open_investigator + cell-authoring tools. Draw on jupyterlite/ai registry separation.
- Research Source: `research/2026-07-19-ai-chat-refactor-coupling-coverage-research.md`

### Proposal 1 — Injected tool registry + session hook + dead-path cleanup (recommended)

- Overview: Treat the agent loop as a pure orchestrator over `AiAgentChatService` + an injectable `ChatToolExecutor`. Keep notebook cell writers as a cohesive module (or small registry map) that implements that executor; stop hard-importing `executeNotebookTool` from the loop. Extract chat session/UI state into `useAiChatSession`. Move `fetch` ownership so the feature only parses NDJSON / defines tools; HTTP stays in the app adapter. Remove unused workspace `TabKind: 'chat'` / link APIs (or wire link later—prefer remove for cohesion). Expand colocated unit/RTL tests to match the new seams.
- Key Changes:
  - `toolLoop.ts`: accept `executeTool(call) => string` (and optional `toolCallSummary`); no import of `notebookCellTools`.
  - `notebookCellTools.ts`: stay notebook-authoring cohesive; import magic parsers via `@features/cribl-search` / `@features/cribl-api` barrels; optionally split `appendCell` / sync helpers.
  - `useAiChatSession.ts` (+ thin `AiChatTab` view): sessionId, api/ui messages, send/clear/stop, tool-host wiring.
  - `agentNdjson.ts`: keep `parseAgentNdjsonBody` + constants in feature; `postOpenInvestigatorTurn` only invoked from `app/openInvestigatorChatAdapter.ts` (or move post into app, re-export parse from feature).
  - Shared agent path: move `AI_RIPTIDE_AGENT_PATH` (or a neutral `OPEN_INVESTIGATOR_AGENT_PATH`) to a small shared module / domain constant so chat does not depend on `ai-riptide` for a string.
  - Remove `createChatTab` / `SET_CHAT_LINK` / `TabKind: 'chat'` if unused by product; update `tabWorkspace` tests.
  - Tests: expand tool matrix, loop abort/max-rounds, adapter/parse errors, `AiChatTab` RTL with mock `AiChatProvider`, left-panel mode switch.
- Trade-offs: Benefits — matches hexagonal + jupyterlite-style registry; testable loop without React/workspace; clearer slice boundaries. Risks — slightly more files; removing dead chat-tab APIs is a small breaking change for any external consumers (none in-repo UI).
- Validation: `npm test` focused on `ai-chat` + `tabWorkspace` + `NotebookPage`; lint; manual left-panel chat smoke on staging if available.
- Open Questions: Keep writing to **active** notebook (current product) vs revive `linkedNotebookTabId` (prior plan)? Prefer keep active for this refactor unless product asks for pin.

### Proposal 2 — Minimal extract + test-only (lower structural change)

- Overview: Leave `toolLoop` → `executeNotebookTool` hard-wire in place. Extract `useAiChatSession` from `AiChatTab` and switch magic imports to barrels. Do not remove workspace chat kinds. Focus effort on filling test gaps (RTL, lookup/title, abort/max-rounds, adapter).
- Key Changes: Hook extract; barrel imports; new/expanded `*.test.ts(x)` only.
- Trade-offs: Benefits — smaller diff, lower regression risk. Risks — loop remains coupled to notebook tools; dead `TabKind: 'chat'` stays; HTTP remains in feature; less aligned with “loose coupling” ask and jupyterlite inspiration.
- Validation: Same test command surface; less confidence that future tools (e.g. `run_cell`) plug in cleanly.
- Open Questions: Whether a second pass will still be needed for registry injection.

**Choice for planning:** Proposal 1 — stronger fit to repo layering, jupyterlite-style tool separation, and the explicit coupling/coverage request.
