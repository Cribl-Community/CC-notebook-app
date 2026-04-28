import { describe, expect, it } from 'vitest'
import { formatJsonBodySampleYaml, payloadYamlAfterUriSelect } from '@features/cribl-api/editor/criblApiCompletions'

describe('formatJsonBodySampleYaml', () => {
  it('produces a top-level json mapping', () => {
    const s = formatJsonBodySampleYaml({ a: 1, b: 'x' })
    expect(s.trimStart().startsWith('json:')).toBe(true)
    expect(s).toMatch(/a:\s*1/)
  })
})

describe('payloadYamlAfterUriSelect', () => {
  const base = { path: '/x', summary: 's' } as const

  it('fills json: {} for POST when catalog has no jsonBody', () => {
    const y = payloadYamlAfterUriSelect({ method: 'POST', ...base })
    expect(y).toContain('json:')
    expect(y).toMatch(/\{\}/)
  })

  it('uses catalog jsonBody when present', () => {
    const y = payloadYamlAfterUriSelect({ method: 'PUT', ...base, jsonBody: { id: 'a' } })
    expect(y).toMatch(/id:\s*a/)
  })

  it('does not add yaml for GET', () => {
    expect(payloadYamlAfterUriSelect({ method: 'GET', ...base })).toBe('')
  })

  it('adds yaml for DELETE only when jsonBody is defined in catalog', () => {
    expect(payloadYamlAfterUriSelect({ method: 'DELETE', ...base })).toBe('')
    expect(payloadYamlAfterUriSelect({ method: 'DELETE', ...base, jsonBody: { confirm: true } })).toContain('confirm')
  })
})
