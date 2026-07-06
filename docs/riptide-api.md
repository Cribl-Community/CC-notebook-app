# Invoking the Riptide AI agent API

This document describes how to call Cribl’s **Riptide** agent endpoint for features such as notebook assistance. It reflects behavior observed on Search **Copilot Investigation** (`/search/agent`) against staging; contract details may evolve with the product.

Telemetry endpoints such as `POST /api/v1/ai/event` and access pings are **out of scope** here—the Riptide call alone carries the session and model interaction.

## Endpoint

| Piece | Value |
|--------|--------|
| Path | `/api/v1/ai/q/agents/riptide` |
| Full URL (example) | `https://<org-host>.cribl-staging.cloud/api/v1/ai/q/agents/riptide` |
| Method | `POST` |
| Request `Content-Type` | `application/json` |
| Response `Content-Type` | `application/x-ndjson` (streamed newline-delimited JSON) |

The same URL family is used for other agents (e.g. KQL translation uses `/api/v1/ai/q/agents/kql`; see `src/platform/cribl/aiTranslate.ts`).

## Authentication

- **Inside Cribl App Platform**: use `fetch` against `CRIBL_API_URL + '/ai/q/agents/riptide'`. The parent **fetch proxy** attaches credentials; your iframe code does not handle tokens manually. See [`docs/PLATFORM.md`](./PLATFORM.md).
- **Direct API clients** (e.g. internal tools): requests include standard Cribl session headers such as `Authorization: Bearer <JWT>` and contextual headers (e.g. `x-cribl-surface`, encoded context). Do not hard-code or commit tokens.

## Request body (conceptual)

Structure observed for Riptide:

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
- **`context.resources`**: Search injects dataset/lookup catalogs so the model knows what exists. For **notebooks**, replace or extend with notebook-specific context (cells, active selection, kernel metadata) if the backend/agent supports it—confirm with your target environment.
- **`tools`**: Search sends a **large** array of tool schemas (e.g. suggestions UI, `run_search`, `edit_notebook`, dataset/lookup helpers). The exact set is product-defined. For a minimal client, start with the shapes your UI needs and align with API validation in your deployment.

## Response: NDJSON stream

The response body is **not** a single JSON value. Read it as **one JSON object per line** (`application/x-ndjson`).

Typical line shapes:

1. **Streaming assistant text** (many lines):

   `{"name":"agent:riptide","role":"assistant","content":"<fragment>"}`

   Concatenate `content` strings in order to reconstruct the reply. Empty string fragments may appear; handle `null` safely if present.

2. **Tool calls** (often near the end of a turn):

   `{"name":"agent:riptide","role":"assistant","content":null,"tool_calls":[{"id":"...","function":{"name":"<toolName>","arguments":"<JSON string>"}}]}`

   Parse `tool_calls` to drive UI (buttons, searches, notebook edits, etc.) according to each tool’s contract.

Timeouts: use `AbortController` and an appropriate limit for long streams (the KQL client uses ~60s for translation in `src/platform/cribl/aiTranslate.ts`; interactive chat may need longer).

## Minimal `fetch` sketch (App Platform)

```typescript
const base = window.CRIBL_API_URL?.replace(/\/$/, '') || '/api/v1'
const res = await fetch(`${base}/ai/q/agents/riptide`, {
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

Adjust **`context`** and **`tools`** to match what your org’s Riptide deployment expects.

## Related code in this repo

| File | Relevance |
|------|-----------|
| `src/platform/cribl/aiTranslate.ts` | Same API family for `/ai/q/agents/kql`: POST JSON, `stream: true`, parsing text/JSON from the response body |
| `src/features/ai-riptide/riptideService.ts` | Riptide request/response helpers used by the notebook AI adapter |
| [`docs/PLATFORM.md`](./PLATFORM.md) | `CRIBL_API_URL`, fetch proxy, auth behavior |

## See also

- Internal `/api/v1/ai/settings/*` and `/api/v1/ai/consent/*` endpoints may gate AI features for the org; handle errors accordingly in the UI.
