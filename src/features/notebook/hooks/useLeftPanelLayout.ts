import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

const WIDTH_KEY = 'nb-left-panel-width'
const OPEN_KEY = 'nb-left-panel-open'
export const LEFT_PANEL_RAIL_WIDTH = 36
export const LEFT_PANEL_DEFAULT_BODY_WIDTH = 280
export const LEFT_PANEL_MIN_BODY_WIDTH = 180
export const LEFT_PANEL_MAX_BODY_WIDTH = 520

function storageGet(key: string): string | null {
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function storageSet(key: string, value: string): void {
  try {
    globalThis.localStorage?.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function readStoredWidth(): number {
  const raw = storageGet(WIDTH_KEY)
  if (!raw) return LEFT_PANEL_DEFAULT_BODY_WIDTH
  const n = Number(raw)
  if (!Number.isFinite(n)) return LEFT_PANEL_DEFAULT_BODY_WIDTH
  return Math.min(LEFT_PANEL_MAX_BODY_WIDTH, Math.max(LEFT_PANEL_MIN_BODY_WIDTH, Math.round(n)))
}

function readStoredOpen(): boolean {
  const raw = storageGet(OPEN_KEY)
  if (raw === null) return true
  return raw !== '0' && raw !== 'false'
}

/**
 * Persisted left-panel open state + body width, with pointer-drag resize.
 */
export function useLeftPanelLayout() {
  const [open, setOpen] = useState(readStoredOpen)
  const [bodyWidth, setBodyWidth] = useState(readStoredWidth)
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    storageSet(OPEN_KEY, open ? '1' : '0')
  }, [open])

  useEffect(() => {
    storageSet(WIDTH_KEY, String(bodyWidth))
  }, [bodyWidth])

  const toggleOpen = useCallback(() => {
    setOpen((v) => !v)
  }, [])

  const setOpenValue = useCallback((next: boolean) => {
    setOpen(next)
  }, [])

  const onResizePointerDown = useCallback(
    (e: ReactPointerEvent<HTMLElement>) => {
      if (!open) return
      e.preventDefault()
      const target = e.currentTarget
      target.setPointerCapture(e.pointerId)
      dragRef.current = { startX: e.clientX, startWidth: bodyWidth }

      const onMove = (ev: PointerEvent) => {
        const drag = dragRef.current
        if (!drag) return
        const delta = ev.clientX - drag.startX
        const next = Math.min(
          LEFT_PANEL_MAX_BODY_WIDTH,
          Math.max(LEFT_PANEL_MIN_BODY_WIDTH, Math.round(drag.startWidth + delta)),
        )
        setBodyWidth(next)
      }
      const onUp = (ev: PointerEvent) => {
        dragRef.current = null
        target.releasePointerCapture(ev.pointerId)
        target.removeEventListener('pointermove', onMove)
        target.removeEventListener('pointerup', onUp)
        target.removeEventListener('pointercancel', onUp)
        document.body.classList.remove('nb-left-resizing')
      }
      document.body.classList.add('nb-left-resizing')
      target.addEventListener('pointermove', onMove)
      target.addEventListener('pointerup', onUp)
      target.addEventListener('pointercancel', onUp)
    },
    [bodyWidth, open],
  )

  return {
    open,
    bodyWidth,
    toggleOpen,
    setOpen: setOpenValue,
    onResizePointerDown,
    totalWidth: open ? LEFT_PANEL_RAIL_WIDTH + bodyWidth : 0,
  }
}
