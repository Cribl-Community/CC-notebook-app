import { describe, expect, it } from 'vitest'
import { getCriblApiPathEditContext } from '@features/cribl-api/criblApiPathLine'

describe('getCriblApiPathEditContext', () => {
  it('returns empty path prefix after METHOD + space', () => {
    const line = '%%cribl_api GET '
    const ed = getCriblApiPathEditContext(line, 0, line.length)
    expect(ed).not.toBeNull()
    if (!ed) return
    expect(ed.method).toBe('GET')
    expect(ed.pathPrefix).toBe('')
  })
  it('returns prefix while typing a path', () => {
    const line = '%%cribl_api GET /m/de'
    const ed = getCriblApiPathEditContext(line, 0, line.length)
    expect(ed?.pathPrefix).toBe('/m/de')
  })
  it('is null on line 1 when not in path (var= region)', () => {
    const line = '%%cribl_api GET /m/x var=jobs'
    const pos = line.indexOf('v')
    expect(getCriblApiPathEditContext(line, 0, pos)).toBeNull()
  })
})
