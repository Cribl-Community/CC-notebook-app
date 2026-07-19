# Invoking the notebook AI agent API

This document describes how the notebook app calls Cribl’s AI agent endpoint for Python generation and error-fix suggestions. The UI still labels this “Riptide”; the HTTP agent id is **`open_investigator`**.

**History:** Search Copilot Investigation originally used agent id `riptide`. Cribl renamed that agent to `local_search` (Search investigation with built-in KQL tools). Notebook code-gen sends `tools: []` and expects assistant text (fenced Python), so this app calls `open_investigator` instead — the registered agent meant for external clients that supply their own tools/context.

Telemetry endpoints such as `POST /api/v1/ai/event` and access pings are **out of scope** here—the agent call alone carries the session and model interaction.

## Endpoint

| Piece | Value |
|--------|--------|
| Path | `/api/v1/ai/q/agents/open_investigator` |
| Full URL (example) | `https://<org-host>.cribl-staging.cloud/api/v1/ai/q/agents/open_investigator` |
| Method | `POST` |
| Request `Content-Type` | `application/json` |
| Response `Content-Type` | `application/x-ndjson` (streamed newline-delimited JSON) |

The same URL family is used for other agents (e.g. KQL translation uses `/api/v1/ai/q/agents/kql`; see `src/platform/cribl/aiTranslate.ts`). Calling a removed id such as `riptide` returns HTTP 500 with `{"reason":"Agent riptide is not registered"}`.

## Authentication

- **Inside Cribl App Platform**: use `fetch` against `CRIBL_API_URL + '/ai/q/agents/open_investigator'`. The parent **fetch proxy** attaches credentials; your iframe code does not handle tokens manually. See [`docs/PLATFORM.md`](./PLATFORM.md).
- **Direct API clients** (e.g. internal tools): requests include standard Cribl session headers such as `Authorization: Bearer <JWT>` and contextual headers (e.g. `x-cribl-surface`, encoded context). Do not hard-code or commit tokens.

## Request body (conceptual)

Structure used by the notebook client:

```json
{
  "messages": [
    {
      "id": "<uuid>",
      "role": "user",
      "content": "<user message text>",
      "reqId": 0
    }
  ],
  "stream": true,
  "sessionId": "<uuid>",
  "context": {
    "resources": {
      "availableDatasets": [{ "id": "<datasetId>", "description": "<string>" }],
      "availableLookups": [{ "id": "<lookupId>", "description": "<string>" }],
      "externalSources": []
    },
    "files": {}
  },
  "tools": [ "<tool definitions for function-calling / agent actions>" ]
}
```

Notes:

- **`messages`**: Conversation turns; extend for multi-turn by appending prior assistant/user messages as the product does.
- **`sessionId`**: Correlates a conversation; keep stable across turns in one chat.
- **`context.resources`**: Optional catalog injection (datasets/lookups). The notebook client currently sends empty arrays; extend with notebook-specific context if useful.
- **`tools`**: Optional remote tool schemas executed by the client. Shape is **Cribl**, not OpenAI nested `function.name`:

  ```json
  { "id": "create_python_cell", "description": "…", "schema": { "type": "object", "properties": { … } } }
  ```

  - **Per-cell Riptide / Suggest Fix** (`riptideService.ts`) still sends `tools: []` and only concatenates assistant text.
  - **AI Chat tab** (`src/features/ai-chat/`) sends notebook-authoring tools and runs a client tool loop: on `tool_calls`, execute locally, append assistant (`content: ""`) + `role: "tool"` messages, re-POST until text-only (max 8 rounds).

## Response: NDJSON stream

The response body is **not** a single JSON value. Read it as **one JSON object per line** (`application/x-ndjson`).

Typical line shapes:

1. **Streaming assistant text** (many lines):

   `{"name":"agent:open_investigator","role":"assistant","content":"<fragment>"}`

   Concatenate `content` strings in order to reconstruct the reply. Empty string fragments may appear; handle `null` safely if present. (Older streams used `agent:riptide`; the notebook parser accepts any `content` / `delta.content`.)

2. **Tool calls** (often near the end of a turn):

   `{"name":"agent:open_investigator","role":"assistant","content":null,"tool_calls":[{"id":"...","function":{"name":"<toolName>","arguments":"<JSON string>"}}]}`

   The per-cell Python path does not execute tool calls; it only extracts text / fenced Python. The AI Chat tab executes matching client tools (create markdown/Python/magic cells on a linked notebook).

Timeouts: use `AbortController` and an appropriate limit for long streams (the KQL client uses ~60s for translation in `src/platform/cribl/aiTranslate.ts`; interactive chat may need longer).

## Minimal `fetch` sketch (App Platform)

```typescript
const base = window.CRIBL_API_URL?.replace(/\/$/, '') || '/api/v1'
const res = await fetch(`${base}/ai/q/agents/open_investigator`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ id: crypto.randomUUID(), role: 'user', content: userText, reqId: 0 }],
    stream: true,
    sessionId: conversationId,
    context: { resources: { availableDatasets: [], availableLookups: [], externalSources: [] }, files: {} },
    tools: [], // supply real tool defs when required by your deployment
  }),
})
if (!res.ok) throw new Error(`Riptide HTTP ${res.status}`)
const text = await res.text()
for (const line of text.split(/\r?\n/)) {
  const t = line.trim()
  if (!t) continue
  const row = JSON.parse(t) as { name?: string; role?: string; content?: string | null; tool_calls?: unknown }
  // accumulate row.content, handle row.tool_calls
}
```

Adjust **`context`** and **`tools`** if you add a client-side tool loop later.

## Related code in this repo

| File | Relevance |
|------|-----------|
| `src/platform/cribl/aiTranslate.ts` | Same API family for `/ai/q/agents/kql`: POST JSON, `stream: true`, parsing text/JSON from the response body |
| `src/features/ai-riptide/riptideService.ts` | One-shot agent helpers for per-cell codegen / fix (`AI_RIPTIDE_AGENT_PATH`, `tools: []`) |
| `src/features/ai-chat/` | Multi-turn chat tab + tool loop + notebook cell tools (`AiAgentChatService`) |
| `src/app/openInvestigatorChatAdapter.ts` | Chat port adapter (composition root) |
| [`docs/PLATFORM.md`](./PLATFORM.md) | `CRIBL_API_URL`, fetch proxy, auth behavior |

## See also

- Internal `/api/v1/ai/settings/*` and `/api/v1/ai/consent/*` endpoints may gate AI features for the org; handle errors accordingly in the UI.
