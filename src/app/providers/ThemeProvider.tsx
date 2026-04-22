import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  APP_STYLE_STORAGE_KEY,
  DEFAULT_APP_STYLE,
  LEGACY_THEME_STORAGE_KEY,
  type AppStyleId,
  type CodeMirrorLuma,
  isAppStyleId,
  migrateLegacyTheme,
  NOTEBOOK_STYLES,
  codeMirrorLumaForStyle,
} from '@app/styles/nbStyles'

export interface ThemeController {
  /** Active notebook visual style (palettes in `nb-palettes.css`). */
  appStyle: AppStyleId
  setAppStyle: (s: AppStyleId) => void
  /** Light vs dark for CodeMirror chrome; syntax colors use CSS variables. */
  codeMirrorLuma: CodeMirrorLuma
  /** Cycles through `NOTEBOOK_STYLES` order (for tests / power users). */
  cycleAppStyle: () => void
}

const ThemeContext = createContext<ThemeController | null>(null)

function readInitialAppStyle(): AppStyleId {
  try {
    const raw = localStorage.getItem(APP_STYLE_STORAGE_KEY)
    if (isAppStyleId(raw)) return raw
    const migrated = migrateLegacyTheme(localStorage.getItem(LEGACY_THEME_STORAGE_KEY))
    if (migrated) return migrated
  } catch {
    /* localStorage unavailable */
  }
  return DEFAULT_APP_STYLE
}

/**
 * Owns the notebook’s visual style and syncs `document.documentElement.dataset.nbStyle`
 * with `localStorage` so the choice survives reloads. Replaces the old two-option
 * light/dark `data-theme` switch.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appStyle, setAppStyleState] = useState<AppStyleId>(readInitialAppStyle)

  useEffect(() => {
    document.documentElement.dataset.nbStyle = appStyle
    try {
      localStorage.setItem(APP_STYLE_STORAGE_KEY, appStyle)
    } catch {
      // sandboxed iframe — style may reset on reload
    }
  }, [appStyle])

  const setAppStyle = useCallback((s: AppStyleId) => setAppStyleState(s), [])

  const cycleAppStyle = useCallback(() => {
    setAppStyleState((prev) => {
      const ids = NOTEBOOK_STYLES.map((x) => x.id)
      const i = ids.indexOf(prev)
      if (i < 0) return DEFAULT_APP_STYLE
      return ids[(i + 1) % ids.length]!
    })
  }, [])

  const codeMirrorLuma = useMemo(() => codeMirrorLumaForStyle(appStyle), [appStyle])

  const value = useMemo<ThemeController>(
    () => ({ appStyle, setAppStyle, codeMirrorLuma, cycleAppStyle }),
    [appStyle, setAppStyle, codeMirrorLuma, cycleAppStyle],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeController {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used inside <ThemeProvider>')
  return ctx
}
