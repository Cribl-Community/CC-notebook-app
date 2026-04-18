import { describe, it, expect } from 'vitest'
import { normalizeSearchQuery, runCriblSearchJob } from './searchJobs'

describe('normalizeSearchQuery', () => {
  it('prepends cribl when missing', () => {
    expect(normalizeSearchQuery('dataset=x | limit 1')).toBe('cribl dataset=x | limit 1')
  })

  it('does not double-prefix', () => {
    expect(normalizeSearchQuery('cribl dataset=x')).toBe('cribl dataset=x')
    expect(normalizeSearchQuery('CRIBL dataset=x')).toBe('CRIBL dataset=x')
  })
})

describe('runCriblSearchJob mock', () => {
  it('returns rows without CRIBL_API_URL', async () => {
    const lines: string[] = []
    const rows = await runCriblSearchJob({
      query: 'dataset=x',
      onProgress: (l) => lines.push(l),
    })
    expect(rows.length).toBeGreaterThan(0)
    expect(lines.some((l) => l.includes('mock'))).toBe(true)
  })
})
