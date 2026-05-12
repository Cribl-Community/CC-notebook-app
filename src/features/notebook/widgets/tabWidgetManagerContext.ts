import { createContext } from 'react'
import type { NotebookWidgetManager } from '@features/notebook/widgets/notebookWidgetManager'

export const TabWidgetManagerContext = createContext<NotebookWidgetManager | null>(null)
