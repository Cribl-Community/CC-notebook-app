/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { LookupService } from '@ports/LookupService'
import { criblLookupService } from '@platform/cribl/searchLookups'

const LookupContext = createContext<LookupService | null>(null)

/**
 * Injects {@link LookupService} for `%%cribl_save_search_lookup` /
 * `%%cribl_load_search_lookup`. Production uses the Cribl REST adapter; tests
 * pass a stub via `value`.
 */
export function LookupProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: LookupService
}) {
  const service = useMemo<LookupService>(() => value ?? criblLookupService, [value])
  return <LookupContext.Provider value={service}>{children}</LookupContext.Provider>
}

export function useLookupService(): LookupService {
  const ctx = useContext(LookupContext)
  if (!ctx) {
    throw new Error('useLookupService must be called inside <LookupProvider>.')
  }
  return ctx
}
