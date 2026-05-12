import { createContext, type ReactNode } from 'react'
import type { NotebookWidgetManager } from '@features/notebook/widgets/notebookWidgetManager'

export const TabWidgetManagerContext = createContext<NotebookWidgetManager | null>(null)

export function TabWidgetManagerProvider({
  manager,
  children,
}: {
  manager: NotebookWidgetManager | null
  children: ReactNode
}) {
  return <TabWidgetManagerContext.Provider value={manager}>{children}</TabWidgetManagerContext.Provider>
}
