import type { AiCodeService } from '@ports/AiCodeService'
import { getCriblApiBase } from '@platform/env/env'
import {
  generatePythonFromPrompt,
  suggestErrorFix,
} from '@features/ai-riptide/riptideService'

/**
 * Default AiCodeService adapter: calls Cribl Riptide through the platform
 * fetch proxy. Returns `isAvailable=false` in local dev where no Cribl API
 * base is configured, so the UI can gate features deterministically.
 */
export const riptideAiCodeService: AiCodeService = {
  isAvailable() {
    return Boolean(getCriblApiBase())
  },
  generatePythonFromPrompt(userText, options) {
    return generatePythonFromPrompt(getCriblApiBase(), userText, options)
  },
  suggestErrorFix(cellSource, ename, evalue, traceback, options) {
    return suggestErrorFix(getCriblApiBase(), cellSource, ename, evalue, traceback, options)
  },
}
