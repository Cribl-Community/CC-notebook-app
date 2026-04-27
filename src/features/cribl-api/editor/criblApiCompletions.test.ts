import { describe, expect, it } from 'vitest'
import { formatJsonBodySampleYaml } from '@features/cribl-api/editor/criblApiCompletions'

describe('formatJsonBodySampleYaml', () => {
  it('produces a top-level json mapping', () => {
    const s = formatJsonBodySampleYaml({ a: 1, b: 'x' })
    expect(s.trimStart().startsWith('json:')).toBe(true)
    expect(s).toMatch(/a:\s*1/)
  })
})
