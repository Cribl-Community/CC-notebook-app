import { describe, it, expect } from 'vitest'
import {
  buildCriblApiRequestFromYamlObject,
  parseCriblApiMagic,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
} from '@features/cribl-api/criblApiMagic'

describe('parseCriblApiMagic', () => {
  it('parses first line and empty YAML for GET', () => {
    const p = parseCriblApiMagic('%%cribl_api GET /m/default_search/search/jobs var=jobs\n')
    expect(p.kind).toBe('cribl_api')
    if (p.kind === 'cribl_api') {
      expect(p.value.method).toBe('GET')
      expect(p.value.path).toBe('/m/default_search/search/jobs')
      expect(p.value.varName).toBe('jobs')
      expect(p.value.yamlBlock).toBe('')
    }
  })

  it('rejects method line without path', () => {
    const p = parseCriblApiMagic('%%cribl_api GET\n')
    expect(p.kind).toBe('error')
  })

  it('rejects path not starting with /', () => {
    const p = parseCriblApiMagic('%%cribl_api GET badpath\n')
    expect(p.kind).toBe('error')
  })

  it('parses YAML with json: body', () => {
    const src = `%%cribl_api POST /m/default_search/search/jobs var=job
json:
  query: "cribl dataset=goatherd | limit 1"
  earliest: "-1h"
  latest: "now"
  sampleRate: 1
`
    const p = parseCriblApiMagic(src)
    expect(p.kind).toBe('cribl_api')
    if (p.kind === 'cribl_api') {
      expect(p.value.method).toBe('POST')
      const req = parseCriblApiYamlToRequest(p.value.yamlBlock)
      expect(req.bodyIsJson).toBe(true)
      expect(req.body).toContain('goatherd')
    }
  })

  it('rejects unknown YAML keys at top level', () => {
    const src = '%%cribl_api GET /a\nquery: 1\n'
    const p = parseCriblApiMagic(src)
    expect(p.kind).toBe('cribl_api')
    if (p.kind === 'cribl_api') {
      expect(() => parseCriblApiYamlToRequest(p.value.yamlBlock)).toThrow(/Unknown key/)
    }
  })
})

describe('buildCriblApiRequestFromYamlObject', () => {
  it('prefers json over body', () => {
    const p = buildCriblApiRequestFromYamlObject({
      json: { a: 1 },
      body: 'ignored',
    } as never)
    expect(p.body).toBe('{"a":1}')
    expect(p.bodyIsJson).toBe(true)
  })
})

describe('wantsCriblApiJinjaTemplating', () => {
  it('auto matches search-style heuristics', () => {
    expect(wantsCriblApiJinjaTemplating('x: 1\nd: {{ t }}', 'auto')).toBe(true)
    expect(wantsCriblApiJinjaTemplating('a: 1', 'auto')).toBe(false)
  })
})
