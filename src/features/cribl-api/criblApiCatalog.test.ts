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
  it('does not treat typed /m as a prefix of /master (segment "m" vs "master")', () => {
    expect(opPathMatchesTypedPrefix('/m', '/master/groups')).toBe(false)
    expect(opPathMatchesTypedPrefix('/master', '/master/groups')).toBe(true)
    expect(opPathMatchesTypedPrefix('/mas', '/master/groups')).toBe(true)
  })
})

describe('listCriblApiPathCompletions', () => {
  it('lists GET paths and filters by prefix', () => {
    const all = listCriblApiPathCompletions('GET', '/')
    expect(all.length).toBeGreaterThan(0)
    const m = listCriblApiPathCompletions('GET', '/m/default')
    expect(m.some((o) => o.path.includes('default_search'))).toBe(true)
  })
  it('includes /system/settings/git-settings (leader override; absent from public OpenAPI)', () => {
    const r = listCriblApiPathCompletions('GET', '/system/settings/git')
    expect(r.some((o) => o.path === '/system/settings/git-settings')).toBe(true)
  })
  it('includes /m/{groupId}/system/inputs (leader group context; bare /system/inputs is worker-host shape in OpenAPI)', () => {
    const r = listCriblApiPathCompletions('GET', '/m/')
    expect(r.some((o) => o.path === '/m/{groupId}/system/inputs')).toBe(true)
  })
  it('GET /m lists system group routes (not truncated before inputs)', () => {
    const r = listCriblApiPathCompletions('GET', '/m', 500)
    expect(r.some((o) => o.path === '/m/{groupId}/system/inputs')).toBe(true)
    const idx = r.findIndex((o) => o.path === '/m/{groupId}/system/inputs')
    expect(idx).toBeGreaterThanOrEqual(0)
    expect(idx).toBeLessThan(80)
  })
  it('includes /m/{groupId}/pipelines (leader group mirror for OpenAPI /pipelines)', () => {
    const r = listCriblApiPathCompletions('GET', '/m/', 500)
    expect(r.some((o) => o.path === '/m/{groupId}/pipelines')).toBe(true)
  })
})

describe('findCriblApiCatalogEntry', () => {
  it('resolves a concrete id path to a {id} template (OpenAPI shape)', () => {
    const o = findCriblApiCatalogEntry('GET', '/functions/func-1')
    expect(o).toBeDefined()
    expect(o?.path).toContain('{id}')
  })
  it('resolves a Search path from overrides', () => {
    const o = findCriblApiCatalogEntry('GET', '/m/default_search/search/jobs/xyz')
    expect(o).toBeDefined()
    expect(o?.path).toContain('{id}')
  })
  it('resolves a concrete group id to /m/{groupId}/system/inputs', () => {
    const o = findCriblApiCatalogEntry('GET', '/m/default/system/inputs')
    expect(o).toBeDefined()
    expect(o?.path).toBe('/m/{groupId}/system/inputs')
  })
  it('resolves a concrete group id to /m/{groupId}/pipelines', () => {
    const o = findCriblApiCatalogEntry('GET', '/m/default/pipelines')
    expect(o).toBeDefined()
    expect(o?.path).toBe('/m/{groupId}/pipelines')
  })
})
