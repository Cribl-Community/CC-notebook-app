import type {
  AgentChatMessage,
  AgentTurnResult,
  CriblAgentToolDef,
} from '@ports/AiAgentChatService'
import { OPEN_INVESTIGATOR_AGENT_PATH } from '@/domain/openInvestigatorAgent'
import {
  AI_CHAT_TIMEOUT_MS,
  newAgentMessageId,
  parseAgentNdjsonBody,
} from '@features/ai-chat'

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

/** One HTTP round-trip for multi-turn open_investigator chat (composition root). */
export async function postOpenInvestigatorTurn(args: {
  apiBase: string
  sessionId: string
  messages: AgentChatMessage[]
  tools: CriblAgentToolDef[]
  signal?: AbortSignal
}): Promise<AgentTurnResult> {
  const base = args.apiBase.trim() || '/api/v1'
  const url = `${base}${OPEN_INVESTIGATOR_AGENT_PATH}`
  const ac = new AbortController()
  const external = args.signal
  let timedOut = false
  const timer = globalThis.setTimeout(() => {
    timedOut = true
    ac.abort()
  }, AI_CHAT_TIMEOUT_MS)
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
      id: newAgentMessageId(),
      role: 'assistant',
      content: '',
      reqId: args.messages.length,
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    }
    return { assistantText, toolCalls, assistantMessage }
  } catch (e) {
    const name =
      typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : ''
    if (name === 'AbortError') {
      if (timedOut) {
        throw new Error(`AI chat timed out after ${Math.round(AI_CHAT_TIMEOUT_MS / 1000)}s.`)
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    throw e
  } finally {
    globalThis.clearTimeout(timer)
    if (external) external.removeEventListener('abort', mergeExternalAbort)
  }
}
