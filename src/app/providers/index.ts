export { AiCodeProvider, useAiCodeService } from './AiCodeProvider'
export { DialogProvider, useDialogs } from './DialogProvider'
export { EnvProvider, useEnv } from './EnvProvider'
export {
  KernelProvider,
  useKernelFactory,
  useOptionalKernelFactory,
} from './KernelProvider'
export { LookupProvider, useLookupService } from './LookupProvider'
export { SearchProvider, useSearchService } from './SearchProvider'
export { ThemeProvider, useTheme, type ThemeController } from './ThemeProvider'
export type { AppStyleId, AppStyleInfo, CodeMirrorLuma } from '@app/styles/nbStyles'
export { NOTEBOOK_STYLES, DEFAULT_APP_STYLE } from '@app/styles/nbStyles'
/** Bundled Pyodide release string (matches worker); safe for welcome/proxy UI without a feature → platform import. */
export { PYODIDE_RELEASE } from '@platform/pyodide/pyodideVersion'
