/**
 * Public surface for %%cribl_search / lookup magics and editor helpers.
 * Prefer `@features/cribl-search` over deep imports from other slices.
 */
export { filterPyodidePackageChatter } from './criblSearchStreamFilter'
export { planCriblSearchDataframeHydration } from './criblSearchDataframeHydration'
export { parseCriblSearchMagic, wantsCriblSearchJinjaTemplating } from './criblSearchMagic'
export { runCriblSearchJinjaInKernel } from './criblSearchJinjaRender'
export {
  criblSearchIOPub,
  formatCriblSearchError,
  formatCriblSearchJsonRows,
  formatCriblSearchRawRows,
} from './criblSearchCellRunner'
export { CriblSearchOutputView } from './ui/CriblSearchOutput'
export {
  CRIBL_LOOKUP_EXPORT_RESULT_KEY,
  buildExportDataframeToLookupBundleCode,
  buildLookupLoadDataframeCode,
  encodeUtf8ForPythonBase64,
  extractLookupExportFromOutputs,
  parseCriblSearchLookupMagic,
  type CriblDeleteSearchLookupMagicOk,
  type CriblLoadSearchLookupMagicOk,
  type CriblSaveSearchLookupMagicOk,
} from './criblSearchLookupMagic'
export {
  analyzeCriblSearchCell,
  criblSearchCompletionSource,
  tokenizeKqlRegion,
  type CriblSearchCellInfo,
  type KqlToken,
  type KqlTokenKind,
} from './editor/criblSearchEditor'
export { criblSearchKqlHighlightPlugin } from './editor/criblKqlHighlight'
