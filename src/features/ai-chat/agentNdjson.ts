import type { AgentToolCall, AgentTurnResult } from '@ports/AiAgentChatService'
import { AI_RIPTIDE_AGENT_PATH } from '@features/ai-riptide'
import type { AgentChatMessage, CriblAgentToolDef } from '@ports/AiAgentChatService'

export const AI_CHAT_TIMEOUT_MS = 90_000
export const AI_CHAT_MAX_TOOL_ROUNDS = 8

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatAgentHttpError(status: number, body: string, statusText: string): Error {
  const raw = body || statusText
  let reason = ''
  try {
    const parsed = JSON.parse(body) as { reason?: unknown }
    if (typeof parsed.reason === 'string') reason = parsed.reason
  } catch {
    /* keep raw */
  }
  if (/is not registered/i.test(reason) || /is not registered/i.test(raw)) {
    return new Error(
      `AI agent is not available on this Cribl deployment (${reason || raw}). ` +
        'Chat needs a registered open_investigator agent.',
    )
  }
  return new Error(`AI chat request failed (${status}): ${raw}`)
}

/**
 * Parse an NDJSON agent stream into concatenated assistant text and tool_calls.
 */
export function parseAgentNdjsonBody(body: string): {
  assistantText: string
  toolCalls: AgentToolCall[]
} {
  let assistantText = ''
  const toolCalls: AgentToolCall[] = []
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const row = JSON.parse(t) as Record<string, unknown>
      if (
        typeof row.reason === 'string' &&
        row.reason.length > 0 &&
        row.role == null &&
        row.content == null &&
        row.tool_calls == null
      ) {
        throw new Error(row.reason)
      }
      const c = row.content
      if (typeof c === 'string') assistantText += c
      const delta = row.delta
      if (delta && typeof delta === 'object' && delta !== null) {
        const d = delta as { content?: unknown; tool_calls?: unknown }
        if (typeof d.content === 'string') assistantText += d.content
        if (Array.isArray(d.tool_calls)) {
          for (const tc of d.tool_calls) {
            const normalized = normalizeToolCall(tc)
            if (normalized) toolCalls.push(normalized)
          }
        }
      }
      if (Array.isArray(row.tool_calls)) {
        for (const tc of row.tool_calls) {
          const normalized = normalizeToolCall(tc)
          if (normalized) toolCalls.push(normalized)
        }
      }
    } catch (e) {
      if (e instanceof SyntaxError) continue
      throw e
    }
  }
  return { assistantText, toolCalls }
}

function normalizeToolCall(raw: unknown): AgentToolCall | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as { id?: unknown; function?: { name?: unknown; arguments?: unknown } }
  const name = o.function?.name
  if (typeof name !== 'string' || !name) return null
  const id = typeof o.id === 'string' && o.id ? o.id : randomId()
  const args =
    typeof o.function?.arguments === 'string'
      ? o.function.arguments
      : JSON.stringify(o.function?.arguments ?? {})
  return { id, function: { name, arguments: args } }
}

export async function postOpenInvestigatorTurn(args: {
  apiBase: string
  sessionId: string
  messages: AgentChatMessage[]
  tools: CriblAgentToolDef[]
  signal?: AbortSignal
}): Promise<AgentTurnResult> {
  const base = args.apiBase.trim() || '/api/v1'
  const url = `${base}${AI_RIPTIDE_AGENT_PATH}`
  const ac = new AbortController()
  const external = args.signal
  const timer = globalThis.setTimeout(() => ac.abort(), AI_CHAT_TIMEOUT_MS)
  const mergeExternalAbort = () => ac.abort()
  if (external) {
    if (external.aborted) ac.abort()
    else external.addEventListener('abort', mergeExternalAbort)
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: args.messages,
        stream: true,
        sessionId: args.sessionId,
        context: {
          resources: {
            availableDatasets: [],
            availableLookups: [],
            externalSources: [],
          },
          files: {},
        },
        tools: args.tools,
      }),
      signal: ac.signal,
    })
    const body = await res.text()
    if (!res.ok) {
      throw formatAgentHttpError(res.status, body, res.statusText)
    }
    const { assistantText, toolCalls } = parseAgentNdjsonBody(body)
    const assistantMessage: Extract<AgentChatMessage, { role: 'assistant' }> = {
      id: randomId(),
      role: 'assistant',
      content: '',
      reqId: args.messages.length,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    }
    return { assistantText, toolCalls, assistantMessage }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`AI chat timed out after ${Math.round(AI_CHAT_TIMEOUT_MS / 1000)}s.`)
    }
    throw e
  } finally {
    globalThis.clearTimeout(timer)
    if (external) external.removeEventListener('abort', mergeExternalAbort)
  }
}

export { randomId as newAgentMessageId }
