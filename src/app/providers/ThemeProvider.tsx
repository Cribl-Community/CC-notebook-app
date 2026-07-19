/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CAPRA_THEME_STORAGE_KEY,
  DEFAULT_CAPRA_THEME,
  LEGACY_APP_STYLE_STORAGE_KEY,
  LEGACY_THEME_STORAGE_KEY,
  applyCapraThemeClass,
  codeMirrorLumaForMode,
  type CapraThemeMode,
  type CodeMirrorLuma,
  migrateStoredTheme,
} from '@app/styles/capraTheme'

export interface ThemeController {
  /** Capra visual mode (light default; dark via `.dark` on the document root). */
  themeMode: CapraThemeMode
  setThemeMode: (mode: CapraThemeMode) => void
  /** Light vs dark for CodeMirror chrome; syntax colors use Capra-bridged CSS variables. */
  codeMirrorLuma: CodeMirrorLuma
  /** Flip between light and dark (tests / power users). */
  toggleThemeMode: () => void
}

const ThemeContext = createContext<ThemeController | null>(null)

function readInitialThemeMode(): CapraThemeMode {
  try {
    return migrateStoredTheme(
      localStorage.getItem(CAPRA_THEME_STORAGE_KEY),
      localStorage.getItem(LEGACY_APP_STYLE_STORAGE_KEY),
      localStorage.getItem(LEGACY_THEME_STORAGE_KEY),
    )
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_CAPRA_THEME
}

/**
 * Owns Capra light/dark mode and syncs the `.dark` class + `localStorage`
 * so the choice survives reloads. Replaces the former multi-palette `data-nb-style` system.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeMode, setThemeModeState] = useState<CapraThemeMode>(readInitialThemeMode)

  useEffect(() => {
    applyCapraThemeClass(themeMode)
    try {
      localStorage.setItem(CAPRA_THEME_STORAGE_KEY, themeMode)
    } catch {
      // sandboxed iframe — theme may reset on reload
    }
  }, [themeMode])

  const setThemeMode = useCallback((mode: CapraThemeMode) => setThemeModeState(mode), [])

  const toggleThemeMode = useCallback(() => {
    setThemeModeState((prev) => (prev === 'light' ? 'dark' : 'light'))
  }, [])

  const codeMirrorLuma = useMemo(() => codeMirrorLumaForMode(themeMode), [themeMode])

  const value = useMemo<ThemeController>(
    () => ({ themeMode, setThemeMode, codeMirrorLuma, toggleThemeMode }),
    [themeMode, setThemeMode, codeMirrorLuma, toggleThemeMode],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeController {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
