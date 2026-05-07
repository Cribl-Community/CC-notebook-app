/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { EnvService } from '@ports/EnvService'
import { readEnv } from '@platform/env/env'

/**
 * Exposes the runtime `EnvService` snapshot (Cribl API base, KV mock flag)
 * through React context. Values are captured once at mount — the env shape
 * does not change during a session.
 */

const EnvContext = createContext<EnvService | null>(null)

export function EnvProvider({ children, value }: { children: ReactNode; value?: EnvService }) {
  const env = useMemo<EnvService>(() => value ?? readEnv(), [value])
  return <EnvContext.Provider value={env}>{children}</EnvContext.Provider>
}

/** Read the ambient EnvService. Throws if not wrapped in EnvProvider. */
export function useEnv(): EnvService {
  const ctx = useContext(EnvContext)
  if (!ctx) throw new Error('useEnv must be used inside <EnvProvider>')
  return ctx
}
