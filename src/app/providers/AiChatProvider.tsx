/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AiAgentChatService } from '@ports/AiAgentChatService'
import { openInvestigatorChatService } from '@app/openInvestigatorChatAdapter'

const AiChatContext = createContext<AiAgentChatService | null>(null)

/**
 * Provides multi-turn agent chat (open_investigator + client tools).
 * Tests can inject a stub via `value`.
 */
export function AiChatProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: AiAgentChatService
}) {
  const service = useMemo<AiAgentChatService>(
    () => value ?? openInvestigatorChatService,
    [value],
  )
  return <AiChatContext.Provider value={service}>{children}</AiChatContext.Provider>
}

export function useAiChatService(): AiAgentChatService {
  const ctx = useContext(AiChatContext)
  if (!ctx) {
    throw new Error('useAiChatService must be called inside <AiChatProvider>.')
  }
  return ctx
}
