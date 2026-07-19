import type { AiAgentChatService } from '@ports/AiAgentChatService'
import { getCriblApiBase } from '@platform/env/env'
import { postOpenInvestigatorTurn } from '@features/ai-chat/agentNdjson'

/**
 * AiAgentChatService adapter: multi-turn open_investigator with client tools.
 */
export const openInvestigatorChatService: AiAgentChatService = {
  isAvailable() {
    return Boolean(getCriblApiBase())
  },
  runAgentTurn(args) {
    return postOpenInvestigatorTurn({
      apiBase: getCriblApiBase(),
      sessionId: args.sessionId,
      messages: args.messages,
      tools: args.tools,
      signal: args.signal,
    })
  },
}
