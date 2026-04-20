import { describe, expect, it } from 'vitest'
import { resolveCriblAiHostFromHostname } from './aiHost'

describe('resolveCriblAiHostFromHostname', () => {
  it('uses staging ai host for cribl staging domains', () => {
    expect(resolveCriblAiHostFromHostname('cribl-staging.cloud')).toBe('ai.cribl-staging.cloud')
    expect(resolveCriblAiHostFromHostname('app.cribl-staging.cloud')).toBe('ai.cribl-staging.cloud')
  })

  it('uses production ai host for non-staging domains', () => {
    expect(resolveCriblAiHostFromHostname('cribl.cloud')).toBe('ai.cribl.cloud')
    expect(resolveCriblAiHostFromHostname('localhost')).toBe('ai.cribl.cloud')
    expect(resolveCriblAiHostFromHostname('')).toBe('ai.cribl.cloud')
  })
})
