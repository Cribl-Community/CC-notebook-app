/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import type { KernelFactory } from '@ports/KernelPort'
import { pyodideKernelFactory } from '@platform/pyodide/PyodideKernelAdapter'

const KernelFactoryContext = createContext<KernelFactory | undefined>(undefined)

/**
 * Default kernel factory for notebook tabs (Pyodide worker). Tests may wrap with
 * a fake factory via `value`, or pass a factory directly into
 * {@link useTabNotebookRuntime} as the fourth argument.
 */
export function KernelProvider({
  children,
  value,
}: {
  children: ReactNode
  value?: KernelFactory
}) {
  const factory = useMemo<KernelFactory>(() => value ?? pyodideKernelFactory, [value])
  return <KernelFactoryContext.Provider value={factory}>{children}</KernelFactoryContext.Provider>
}

/** @throws when used outside {@link KernelProvider} */
export function useKernelFactory(): KernelFactory {
  const f = useOptionalKernelFactory()
  if (!f) {
    throw new Error('useKernelFactory must be called inside <KernelProvider>.')
  }
  return f
}

/** Returns undefined when no provider (notebook hook supplies its own factory in tests). */
export function useOptionalKernelFactory(): KernelFactory | undefined {
  return useContext(KernelFactoryContext)
}
