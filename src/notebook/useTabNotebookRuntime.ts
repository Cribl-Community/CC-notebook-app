import { useCallback, useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { PyodideKernel } from '../pyodide/PyodideKernel'
import type { CellId } from './types'
import type { WorkspaceAction, WorkspaceState } from './tabWorkspace'

/**
 * Per-tab Pyodide kernel plus a serialized execution queue and generation counter.
 * Generation bumps invalidate in-flight cell runs after kernel restart/stop.
 */
export function useTabNotebookRuntime(
  dispatch: Dispatch<WorkspaceAction>,
  workspaceRef: MutableRefObject<WorkspaceState>,
  tabIdsKey: string,
) {
  const kernelsRef = useRef<Map<string, PyodideKernel>>(new Map())
  const tabGensRef = useRef<Map<string, number>>(new Map())
  const tabQueuesRef = useRef<Map<string, { p: Promise<void> }>>(new Map())
  const tabExecCountersRef = useRef<Map<string, number>>(new Map())
  const tabScheduledIdsRef = useRef<Map<string, Set<CellId>>>(new Map())

  const getRunQueue = useCallback((tabId: string) => {
    const m = tabQueuesRef.current
    if (!m.has(tabId)) m.set(tabId, { p: Promise.resolve() })
    return m.get(tabId)!
  }, [])

  const getScheduledSet = useCallback((tabId: string) => {
    const m = tabScheduledIdsRef.current
    if (!m.has(tabId)) m.set(tabId, new Set())
    return m.get(tabId)!
  }, [])

  const initKernelForTab = useCallback((tabId: string) => {
    const gen = (tabGensRef.current.get(tabId) ?? 0) + 1
    tabGensRef.current.set(tabId, gen)
    dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'loading' } })
    const kernel = new PyodideKernel()
    kernelsRef.current.set(tabId, kernel)
    kernel.ready
      .then(() => {
        if (tabGensRef.current.get(tabId) === gen) {
          dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'ready' } })
        }
      })
      .catch(() => {
        if (tabGensRef.current.get(tabId) === gen) {
          dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'SET_KERNEL_STATUS', status: 'error' } })
        }
      })
  }, [dispatch])

  const restartKernelForTab = useCallback(
    (tabId: string) => {
      kernelsRef.current.get(tabId)?.dispose()
      kernelsRef.current.delete(tabId)
      const q = tabQueuesRef.current.get(tabId)
      if (q) q.p = Promise.resolve()
      tabExecCountersRef.current.set(tabId, 0)
      tabScheduledIdsRef.current.get(tabId)?.clear()
      dispatch({ type: 'TAB_NOTEBOOK', tabId, action: { type: 'RESTART' } })
      initKernelForTab(tabId)
    },
    [dispatch, initKernelForTab],
  )

  useEffect(() => {
    const tabs = workspaceRef.current.tabs
    const ids = new Set(tabs.map((t) => t.id))
    for (const [id, k] of [...kernelsRef.current.entries()]) {
      if (!ids.has(id)) {
        k.dispose()
        kernelsRef.current.delete(id)
        tabGensRef.current.delete(id)
        tabQueuesRef.current.delete(id)
        tabExecCountersRef.current.delete(id)
        tabScheduledIdsRef.current.delete(id)
      }
    }
    for (const tab of tabs) {
      if (tab.kind === 'welcome') continue
      if (!kernelsRef.current.has(tab.id)) {
        initKernelForTab(tab.id)
      }
    }
  }, [tabIdsKey, initKernelForTab, workspaceRef])

  return {
    kernelsRef,
    tabGensRef,
    tabQueuesRef,
    tabExecCountersRef,
    tabScheduledIdsRef,
    getRunQueue,
    getScheduledSet,
    initKernelForTab,
    restartKernelForTab,
  }
}
