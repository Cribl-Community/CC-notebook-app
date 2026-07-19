/**
 * Multi-turn Cribl agent chat with client-executed tools (open_investigator).
 * Separate from one-shot {@link AiCodeService} Python generation.
 */

export type CriblAgentToolDef = {
  id: string
  description: string
  schema: Record<string, unknown>
}

export type AgentChatMessage =
  | { id: string; role: 'user'; content: string; reqId: number }
  | {
      id: string
      role: 'assistant'
      content: string
      reqId: number
      tool_calls?: AgentToolCall[]
    }
  | {
      id: string
      role: 'tool'
      content: string
      reqId: number
      tool_call_id: string
      name?: string
    }

export type AgentToolCall = {
  id: string
  function: { name: string; arguments: string }
}

export type AgentTurnResult = {
  assistantText: string
  toolCalls: AgentToolCall[]
  /** Assistant message to echo back into the next request (content always string). */
  assistantMessage: Extract<AgentChatMessage, { role: 'assistant' }>
}

export interface AiAgentChatService {
  isAvailable(): boolean
  /**
   * One HTTP round-trip: POST messages+tools, parse NDJSON for text and/or tool_calls.
   */
  runAgentTurn(args: {
    sessionId: string
    messages: AgentChatMessage[]
    tools: CriblAgentToolDef[]
    signal?: AbortSignal
  }): Promise<AgentTurnResult>
}
