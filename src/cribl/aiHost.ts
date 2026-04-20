/**
 * Resolve the AI translation host by current Cribl environment hostname.
 *
 * - Staging environments (`*.cribl-staging.cloud`) route to `ai.cribl-staging.cloud`
 * - Everything else routes to `ai.cribl.cloud`
 */
export function resolveCriblAiHostFromHostname(hostname: string): 'ai.cribl.cloud' | 'ai.cribl-staging.cloud' {
  const h = hostname.trim().toLowerCase()
  if (h === 'cribl-staging.cloud' || h.endsWith('.cribl-staging.cloud')) {
    return 'ai.cribl-staging.cloud'
  }
  return 'ai.cribl.cloud'
}

export function resolveCriblAiHost(): 'ai.cribl.cloud' | 'ai.cribl-staging.cloud' {
  const host =
    typeof window !== 'undefined' && typeof window.location?.hostname === 'string'
      ? window.location.hostname
      : ''
  return resolveCriblAiHostFromHostname(host)
}
