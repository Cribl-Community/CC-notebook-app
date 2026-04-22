import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  APP_STYLE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  DEFAULT_APP_STYLE,
  NOTEBOOK_STYLES,
} from '@app/styles/nbStyles'
import { ThemeProvider, useTheme } from './ThemeProvider'

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

describe('ThemeProvider', () => {
  beforeEach(() => {
    try {
      localStorage.removeItem(APP_STYLE_STORAGE_KEY)
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
    } catch {
      /* */
    }
  })

  it('exposes appStyle, setAppStyle, and syncs data-nb-style on the document element', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.appStyle).toBe(DEFAULT_APP_STYLE)
    act(() => result.current.setAppStyle('nord'))
    expect(result.current.appStyle).toBe('nord')
    expect(document.documentElement.dataset.nbStyle).toBe('nord')
  })

  it('cycleAppStyle advances to the next palette and wraps the list', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    const start = result.current.appStyle
    act(() => {
      result.current.cycleAppStyle()
    })
    expect(result.current.appStyle).not.toBe(start)
    const n = NOTEBOOK_STYLES.length
    act(() => {
      for (let i = 0; i < n - 1; i++) result.current.cycleAppStyle()
    })
    expect(result.current.appStyle).toBe(start)
  })

  it('throws when useTheme is used without a provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/)
  })
})
