import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  LEFT_PANEL_DEFAULT_BODY_WIDTH,
  LEFT_PANEL_MAX_BODY_WIDTH,
  LEFT_PANEL_MIN_BODY_WIDTH,
  useLeftPanelLayout,
} from '@features/notebook/hooks/useLeftPanelLayout'

function mockLocalStorage() {
  const map = new Map<string, string>()
  const api = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
    removeItem: (k: string) => {
      map.delete(k)
    },
    clear: () => {
      map.clear()
    },
  }
  vi.stubGlobal('localStorage', api)
  return api
}

describe('useLeftPanelLayout', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.classList.remove('nb-left-resizing')
  })

  it('defaults to open with default body width', () => {
    const { result } = renderHook(() => useLeftPanelLayout())
    expect(result.current.open).toBe(true)
    expect(result.current.bodyWidth).toBe(LEFT_PANEL_DEFAULT_BODY_WIDTH)
  })

  it('toggles open and persists', () => {
    const { result } = renderHook(() => useLeftPanelLayout())
    act(() => {
      result.current.toggleOpen()
    })
    expect(result.current.open).toBe(false)
    expect(localStorage.getItem('nb-left-panel-open')).toBe('0')

    const { result: again } = renderHook(() => useLeftPanelLayout())
    expect(again.current.open).toBe(false)
  })

  it('clamps stored width into bounds', () => {
    localStorage.setItem('nb-left-panel-width', '9999')
    const { result } = renderHook(() => useLeftPanelLayout())
    expect(result.current.bodyWidth).toBe(LEFT_PANEL_MAX_BODY_WIDTH)

    localStorage.setItem('nb-left-panel-width', '10')
    const { result: narrow } = renderHook(() => useLeftPanelLayout())
    expect(narrow.current.bodyWidth).toBe(LEFT_PANEL_MIN_BODY_WIDTH)
  })
})
