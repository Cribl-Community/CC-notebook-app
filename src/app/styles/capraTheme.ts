/**
 * Capra light/dark theme helpers for the notebook app.
 * Dark mode is activated by the `.dark` class on `document.documentElement`
 * (Capra `@capra/theme/base.css`).
 */

export const CAPRA_THEME_STORAGE_KEY = 'nb-capra-theme'
/** Legacy multi-palette key — read once for migration. */
export const LEGACY_APP_STYLE_STORAGE_KEY = 'nb-app-style'
/** Legacy light/dark key — read once for migration. */
export const LEGACY_THEME_STORAGE_KEY = 'nb-theme'

export type CapraThemeMode = 'light' | 'dark'
export type CodeMirrorLuma = CapraThemeMode

export const DEFAULT_CAPRA_THEME: CapraThemeMode = 'light'

export function isCapraThemeMode(value: string | undefined | null): value is CapraThemeMode {
  return value === 'light' || value === 'dark'
}

/**
 * Map persisted prefs to Capra light/dark.
 * - cribl-pro / light → light
 * - cribl-midnight / dark → dark
 * - any other palette id → light
 */
export function migrateStoredTheme(
  capraRaw: string | null,
  appStyleRaw: string | null,
  legacyThemeRaw: string | null,
): CapraThemeMode {
  if (isCapraThemeMode(capraRaw)) return capraRaw

  if (appStyleRaw === 'cribl-midnight' || appStyleRaw === 'dark') return 'dark'
  if (appStyleRaw === 'cribl-pro' || appStyleRaw === 'light') return 'light'
  if (appStyleRaw != null && appStyleRaw !== '') return 'light'

  if (legacyThemeRaw === 'dark') return 'dark'
  if (legacyThemeRaw === 'light') return 'light'

  return DEFAULT_CAPRA_THEME
}

export function codeMirrorLumaForMode(mode: CapraThemeMode): CodeMirrorLuma {
  return mode
}

export function applyCapraThemeClass(mode: CapraThemeMode, root: HTMLElement = document.documentElement): void {
  root.classList.toggle('dark', mode === 'dark')
  delete root.dataset.nbStyle
}
