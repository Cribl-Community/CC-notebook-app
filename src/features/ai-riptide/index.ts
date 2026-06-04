/** Public surface for Riptide AI helpers used outside this slice. */
export {
  AI_RIPTIDE_AGENT_PATH,
  AI_RIPTIDE_TIMEOUT_MS,
  AI_RIPTIDE_FIX_TIMEOUT_MS,
  DEFAULT_RIPTIDE_PROMPT_PREFIX,
  RIPTIDE_CELL_PROMPT_HEADER,
  formatGeneratedPythonSource,
  generatePythonFromPrompt,
  isRiptidePromptCell,
  parseRiptideNdjsonBody,
  parseRiptidePromptFromCellSource,
  suggestErrorFix,
} from './riptideService'
