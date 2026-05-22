/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { NotebookRepo } from '@ports/NotebookRepo'
import { kvNotebookRepo } from '@platform/adapters/notebookRepoAdapter'

const NotebookRepoContext = createContext<NotebookRepo | null>(null)

/**
 * Injects {@link NotebookRepo} for saved-notebook library I/O. Production uses
 * the pack-scoped KV adapter; tests pass a stub via `value`.
 */
export function NotebookRepoProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: NotebookRepo
}) {
  const repo = useMemo<NotebookRepo>(() => value ?? kvNotebookRepo, [value])
  return <NotebookRepoContext.Provider value={repo}>{children}</NotebookRepoContext.Provider>
}

export function useNotebookRepo(): NotebookRepo {
  const ctx = useContext(NotebookRepoContext)
  if (!ctx) {
    throw new Error('useNotebookRepo must be called inside <NotebookRepoProvider>.')
  }
  return ctx
}
