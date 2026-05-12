import { useContext } from 'react'
import { TabWidgetManagerContext } from '@features/notebook/widgets/tabWidgetManagerContext'

export function useTabWidgetManager() {
  return useContext(TabWidgetManagerContext)
}
