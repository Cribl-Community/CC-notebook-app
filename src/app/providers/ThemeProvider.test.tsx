import { act, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  CAPRA_THEME_STORAGE_KEY,
  DEFAULT_CAPRA_THEME,
  LEGACY_APP_STYLE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  migrateStoredTheme,
} from '@app/styles/capraTheme'
import { ThemeProvider, useTheme } from './ThemeProvider'

const wrapper = ({ children }: { children: ReactNode }) => <ThemeProvider>{children}</ThemeProvider>

describe('migrateStoredTheme', () => {
  it('prefers nb-capra-theme when valid', () => {
    expect(migrateStoredTheme('dark', 'cribl-pro', 'light')).toBe('dark')
  })

  it('maps cribl-pro / cribl-midnight and legacy light/dark', () => {
    expect(migrateStoredTheme(null, 'cribl-pro', null)).toBe('light')
    expect(migrateStoredTheme(null, 'cribl-midnight', null)).toBe('dark')
    expect(migrateStoredTheme(null, null, 'dark')).toBe('dark')
    expect(migrateStoredTheme(null, null, 'light')).toBe('light')
  })

  it('maps any other palette id to light', () => {
    expect(migrateStoredTheme(null, 'nord', null)).toBe('light')
    expect(migrateStoredTheme(null, 'dracula', null)).toBe('light')
  })
})

describe('ThemeProvider', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark')
    delete document.documentElement.dataset.nbStyle
    try {
      localStorage.removeItem(CAPRA_THEME_STORAGE_KEY)
      localStorage.removeItem(LEGACY_APP_STYLE_STORAGE_KEY)
      localStorage.removeItem(LEGACY_THEME_STORAGE_KEY)
    } catch {
      /* */
    }
  })

  it('exposes themeMode, setThemeMode, and syncs the Capra .dark class', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.themeMode).toBe(DEFAULT_CAPRA_THEME)
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    act(() => result.current.setThemeMode('dark'))
    expect(result.current.themeMode).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.documentElement.dataset.nbStyle).toBeUndefined()
  })

  it('toggleThemeMode flips light and dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggleThemeMode())
    expect(result.current.themeMode).toBe('dark')
    act(() => result.current.toggleThemeMode())
    expect(result.current.themeMode).toBe('light')
  })

  it('throws when useTheme is used without a provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/)
  })
})
