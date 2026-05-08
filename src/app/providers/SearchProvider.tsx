/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { SearchService } from '@ports/SearchService'
import { criblSearchService } from '@platform/adapters/searchServiceAdapter'

const SearchContext = createContext<SearchService | null>(null)

/**
 * Injects {@link SearchService} for %%cribl_search execution. Production uses
 * the Cribl REST adapter; tests pass a stub via `value`.
 */
export function SearchProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: SearchService
}) {
  const service = useMemo<SearchService>(() => value ?? criblSearchService, [value])
  return <SearchContext.Provider value={service}>{children}</SearchContext.Provider>
}

export function useSearchService(): SearchService {
  const ctx = useContext(SearchContext)
  if (!ctx) {
    throw new Error('useSearchService must be called inside <SearchProvider>.')
  }
  return ctx
}
