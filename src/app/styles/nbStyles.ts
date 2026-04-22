/**
 * Notebook “styles” (visual themes). Inspired by common palettes listed on
 * https://designdotmd.directory/ and popular open design systems — colors are
 * hand-tuned in `nb-palettes.css` to work with the app’s `--nb-*` tokens.
 */
export const APP_STYLE_STORAGE_KEY = 'nb-app-style'
export const LEGACY_THEME_STORAGE_KEY = 'nb-theme'

export type AppStyleId =
  | 'cribl-pro'
  | 'cribl-midnight'
  | 'nord'
  | 'dracula'
  | 'catppuccin'
  | 'tokyo-night'
  | 'rose-pine'
  | 'solarized-light'
  | 'gruvbox'
  | 'one-monokai'

export type CodeMirrorLuma = 'light' | 'dark'

export interface AppStyleInfo {
  id: AppStyleId
  label: string
  /** Drives CodeMirror’s base theme + completion chrome only; syntax still uses CSS vars. */
  codeMirrorLuma: CodeMirrorLuma
}

export const NOTEBOOK_STYLES: readonly AppStyleInfo[] = [
  { id: 'cribl-pro', label: 'Cribl Pro', codeMirrorLuma: 'light' },
  { id: 'cribl-midnight', label: 'Cribl Midnight', codeMirrorLuma: 'dark' },
  { id: 'nord', label: 'Nord', codeMirrorLuma: 'dark' },
  { id: 'dracula', label: 'Dracula', codeMirrorLuma: 'dark' },
  { id: 'catppuccin', label: 'Catppuccin Mocha', codeMirrorLuma: 'dark' },
  { id: 'tokyo-night', label: 'Tokyo Night', codeMirrorLuma: 'dark' },
  { id: 'rose-pine', label: 'Rosé Pine', codeMirrorLuma: 'dark' },
  { id: 'solarized-light', label: 'Solarized', codeMirrorLuma: 'light' },
  { id: 'gruvbox', label: 'Gruvbox', codeMirrorLuma: 'dark' },
  { id: 'one-monokai', label: 'One Monokai', codeMirrorLuma: 'dark' },
] as const

export const DEFAULT_APP_STYLE: AppStyleId = 'cribl-pro'

const ID_SET: ReadonlySet<string> = new Set(NOTEBOOK_STYLES.map((s) => s.id))

export function isAppStyleId(value: string | undefined | null): value is AppStyleId {
  return value != null && value !== '' && ID_SET.has(value)
}

export function getAppStyleInfo(id: AppStyleId): AppStyleInfo {
  const found = NOTEBOOK_STYLES.find((s) => s.id === id)
  if (!found) throw new Error(`Unknown app style: ${id}`)
  return found
}

export function codeMirrorLumaForStyle(id: AppStyleId): CodeMirrorLuma {
  return getAppStyleInfo(id).codeMirrorLuma
}

/** One-time read from `nb-theme` when `nb-app-style` is missing. */
export function migrateLegacyTheme(legacy: string | null): AppStyleId | null {
  if (legacy === 'dark') return 'cribl-midnight'
  if (legacy === 'light') return 'cribl-pro'
  return null
}
