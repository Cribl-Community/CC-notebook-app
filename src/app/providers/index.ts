export { AiCodeProvider, useAiCodeService } from './AiCodeProvider'
export { AiChatProvider, useAiChatService } from './AiChatProvider'
export { DialogProvider, useDialogs } from './DialogProvider'
export { EnvProvider, useEnv } from './EnvProvider'
export {
  KernelProvider,
  useKernelFactory,
  useOptionalKernelFactory,
} from './KernelProvider'
export { LookupProvider, useLookupService } from './LookupProvider'
export { NotebookRepoProvider, useNotebookRepo } from './NotebookRepoProvider'
export { SearchProvider, useSearchService } from './SearchProvider'
export { ThemeProvider, useTheme, type ThemeController } from './ThemeProvider'
export type { CapraThemeMode, CodeMirrorLuma } from '@app/styles/capraTheme'
export { DEFAULT_CAPRA_THEME } from '@app/styles/capraTheme'
/** Bundled Pyodide release string (matches worker); safe for welcome/proxy UI without a feature → platform import. */
export { PYODIDE_RELEASE } from '@platform/pyodide/pyodideVersion'
