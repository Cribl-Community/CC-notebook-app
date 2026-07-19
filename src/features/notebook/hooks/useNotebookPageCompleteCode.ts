import { useCallback } from 'react'
import type { MutableRefObject } from 'react'
import type { CompletionItem } from '@ports/KernelPort'
import { isNotebookTabKind, type WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'

export interface UseNotebookPageCompleteCodeArgs {
  activeTabIdRef: MutableRefObject<string>
  workspaceRef: MutableRefObject<WorkspaceState>
  runtime: TabRuntimeController
}

export function useNotebookPageCompleteCode(args: UseNotebookPageCompleteCodeArgs) {
  const { activeTabIdRef, workspaceRef, runtime } = args

  return useCallback(
    async (code: string, cursor: number): Promise<CompletionItem[] | null> => {
      const tid = activeTabIdRef.current
      const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
      if (!tab || !isNotebookTabKind(tab.kind)) return null
      const kernel = runtime.kernelFor(tid)
      if (!kernel) return null
      const ks = tab.notebook.kernelStatus
      if (ks === 'loading' || ks === 'error') return null
      try {
        await kernel.ready
      } catch {
        return null
      }
      return kernel.complete(code, cursor)
    },
    [activeTabIdRef, workspaceRef, runtime],
  )
}
