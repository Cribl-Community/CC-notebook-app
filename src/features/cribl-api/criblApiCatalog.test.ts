import { describe, expect, it } from 'vitest'
import {
  findCriblApiCatalogEntry,
  listCriblApiPathCompletions,
  opPathMatchesTypedPrefix,
  pathMatchesTemplate,
} from '@features/cribl-api/criblApiCatalog'

describe('pathMatchesTemplate', () => {
  it('matches {id} template', () => {
    expect(pathMatchesTemplate('/g/search/jobs/abc', '/g/search/jobs/{id}')).toBe(true)
    expect(pathMatchesTemplate('/g/search/jobs', '/g/search/jobs/{id}')).toBe(false)
  })
})

describe('opPathMatchesTypedPrefix', () => {
  it('accepts all paths for empty or root prefix', () => {
    expect(opPathMatchesTypedPrefix('/', '/m/a')).toBe(true)
  })
  it('matches segment prefix', () => {
    expect(opPathMatchesTypedPrefix('/m/d', '/m/default_search/jobs')).toBe(true)
  })
})

describe('listCriblApiPathCompletions', () => {
  it('lists GET paths and filters by prefix', () => {
    const all = listCriblApiPathCompletions('GET', '/')
    expect(all.length).toBeGreaterThan(0)
    const m = listCriblApiPathCompletions('GET', '/m/default')
    expect(m.some((o) => o.path.includes('default_search'))).toBe(true)
  })
})

describe('findCriblApiCatalogEntry', () => {
  it('resolves a concrete id path to a {id} template', () => {
    const o = findCriblApiCatalogEntry('GET', '/m/default_search/search/jobs/xyz')
    expect(o).toBeDefined()
    expect(o?.path).toContain('{id}')
  })
})
