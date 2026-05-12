import type { ReactNode } from 'react'
import { TabWidgetManagerContext } from '@features/notebook/widgets/tabWidgetManagerContext'
import type { NotebookWidgetManager } from '@features/notebook/widgets/notebookWidgetManager'

export function TabWidgetManagerProvider({
  manager,
  children,
}: {
  manager: NotebookWidgetManager | null
  children: ReactNode
}) {
  return <TabWidgetManagerContext.Provider value={manager}>{children}</TabWidgetManagerContext.Provider>
}
