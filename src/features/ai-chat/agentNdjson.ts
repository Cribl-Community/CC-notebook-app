import type { AgentToolCall } from '@ports/AiAgentChatService'

export const AI_CHAT_TIMEOUT_MS = 90_000
export const AI_CHAT_MAX_TOOL_ROUNDS = 8

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
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

export { randomId as newAgentMessageId }
