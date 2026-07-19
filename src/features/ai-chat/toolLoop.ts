import type {
  AgentChatMessage,
  AgentToolCall,
  AiAgentChatService,
  CriblAgentToolDef,
} from '@ports/AiAgentChatService'
import { AI_CHAT_MAX_TOOL_ROUNDS, newAgentMessageId } from '@features/ai-chat/agentNdjson'

export type ChatUiMessage =
  | { id: string; kind: 'user'; content: string }
  | { id: string; kind: 'assistant'; content: string }
  | { id: string; kind: 'tool'; summary: string; ok: boolean }
  | { id: string; kind: 'error'; content: string }

export type ChatToolExecutor = (call: AgentToolCall) => string

export type ChatToolSummarizer = (call: AgentToolCall, resultJson: string) => string

export type ChatLoopCallbacks = {
  onAssistantDelta?: (text: string) => void
  onToolResult?: (summary: string, ok: boolean) => void
}

function defaultToolSummary(call: AgentToolCall, resultJson: string): string {
  let ok = false
  try {
    ok = Boolean((JSON.parse(resultJson) as { ok?: boolean }).ok)
  } catch {
    /* ignore */
  }
  return ok ? `Ran ${call.function.name}` : `Tool ${call.function.name} failed`
}

/**
 * Multi-round open_investigator turn: stream text and/or execute injected client tools until done.
 */
export async function runChatToolLoop(args: {
  chat: AiAgentChatService
  sessionId: string
  /** Prior API messages (without the new user turn). */
  priorApiMessages: AgentChatMessage[]
  userText: string
  tools: CriblAgentToolDef[]
  executeTool: ChatToolExecutor
  summarizeTool?: ChatToolSummarizer
  signal?: AbortSignal
  callbacks?: ChatLoopCallbacks
}): Promise<{
  apiMessages: AgentChatMessage[]
  assistantText: string
  uiToolEvents: { summary: string; ok: boolean }[]
}> {
  const summarize = args.summarizeTool ?? defaultToolSummary
  const userMsg: AgentChatMessage = {
    id: newAgentMessageId(),
    role: 'user',
    content: args.userText,
    reqId: args.priorApiMessages.length,
  }
  let messages: AgentChatMessage[] = [...args.priorApiMessages, userMsg]
  let assistantText = ''
  const uiToolEvents: { summary: string; ok: boolean }[] = []

  for (let round = 0; round < AI_CHAT_MAX_TOOL_ROUNDS; round++) {
    if (args.signal?.aborted) throw new DOMException('Aborted', 'AbortError')

    const turn = await args.chat.runAgentTurn({
      sessionId: args.sessionId,
      messages,
      tools: args.tools,
      signal: args.signal,
    })

    if (turn.assistantText) {
      assistantText += turn.assistantText
      args.callbacks?.onAssistantDelta?.(assistantText)
    }

    if (turn.toolCalls.length === 0) {
      return { apiMessages: messages, assistantText, uiToolEvents }
    }

    const assistantEcho: AgentChatMessage = {
      ...turn.assistantMessage,
      content: '',
      tool_calls: turn.toolCalls,
      reqId: messages.length,
    }
    messages = [...messages, assistantEcho]

    const toolMsgs: AgentChatMessage[] = []
    for (const call of turn.toolCalls) {
      const resultJson = args.executeTool(call)
      let ok = false
      try {
        ok = Boolean((JSON.parse(resultJson) as { ok?: boolean }).ok)
      } catch {
        ok = false
      }
      const summary = summarize(call, resultJson)
      uiToolEvents.push({ summary, ok })
      args.callbacks?.onToolResult?.(summary, ok)
      toolMsgs.push({
        id: newAgentMessageId(),
        role: 'tool',
        content: resultJson,
        reqId: messages.length + toolMsgs.length,
        tool_call_id: call.id,
        name: call.function.name,
      })
    }
    messages = [...messages, ...toolMsgs]
  }

  return {
    apiMessages: messages,
    assistantText:
      assistantText ||
      'Stopped after the maximum number of tool rounds. Review the notebook for new cells.',
    uiToolEvents,
  }
}

export function describeToolCalls(calls: AgentToolCall[]): string {
  return calls.map((c) => c.function.name).join(', ')
}
