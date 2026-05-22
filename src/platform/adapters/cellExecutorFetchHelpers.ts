/**
 * Production fetch / env helpers wired into default cell executors.
 * Lives in `platform/` so `features/notebook/executor/*` stays free of direct
 * `@platform/cribl/*` imports (see `docs/ARCHITECTURE.md`).
 */
import { stubEnglishToKqlLocalDev } from '@platform/cribl/aiTranslate'
import { callCriblApi } from '@platform/cribl/criblApiFetch'
import { describeFetchError, isCorsOrNetworkFetchError } from '@platform/cribl/fetchFailure'
import { getCriblApiBase } from '@platform/env/env'

export const cellExecutorFetchHelpers = {
  callCriblApi,
  getCriblApiBase,
  describeFetchError,
  isCorsOrNetworkFetchError,
  stubEnglishToKqlLocalDev,
} as const
