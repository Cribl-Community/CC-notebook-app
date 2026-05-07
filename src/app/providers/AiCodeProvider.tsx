/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { AiCodeService } from '@ports/AiCodeService'
import { riptideAiCodeService } from '@features/ai-riptide/aiCodeAdapter'

const AiCodeContext = createContext<AiCodeService | null>(null)

/**
 * Provides an AiCodeService implementation to descendants. Tests and
 * Storybook scenes can substitute a stub via the `value` prop; production
 * gets the Riptide-backed adapter by default.
 */
export function AiCodeProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: AiCodeService
}) {
  const service = useMemo<AiCodeService>(() => value ?? riptideAiCodeService, [value])
  return <AiCodeContext.Provider value={service}>{children}</AiCodeContext.Provider>
}

export function useAiCodeService(): AiCodeService {
  const ctx = useContext(AiCodeContext)
  if (!ctx) {
    throw new Error('useAiCodeService must be called inside <AiCodeProvider>.')
  }
  return ctx
}
