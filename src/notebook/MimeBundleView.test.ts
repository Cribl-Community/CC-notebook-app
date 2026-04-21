import { describe, expect, it } from 'vitest'
import { pickRenderer } from './mimeRegistry'
import './MimeBundleView'

describe('MimeBundleView registrations', () => {
  it('selects Plotly MIME over text/html when both exist', () => {
    const r = pickRenderer({
      'application/vnd.plotly.v1+json': '{"data":[],"layout":{}}',
      'text/html': '<p>x</p>',
      'text/plain': 'Figure(...)',
    })
    expect(r?.mime).toBe('application/vnd.plotly.v1+json')
  })

  it('selects Vega-Lite over Vega when both exist', () => {
    const r = pickRenderer({
      'application/vnd.vega.v5+json': '{"signals":[]}',
      'application/vnd.vegalite.v5+json': '{"$schema":"https://vega.github.io/schema/vega-lite/v5.json"}',
      'text/plain': 'Altair.Chart',
    })
    expect(r?.mime).toBe('application/vnd.vegalite.v5+json')
  })

  it('selects Vega when only vega.v5 is present', () => {
    const r = pickRenderer({
      'application/vnd.vega.v5+json': '{"$schema":"https://vega.github.io/schema/vega/v5.json"}',
      'text/plain': 'Chart',
    })
    expect(r?.mime).toBe('application/vnd.vega.v5+json')
  })
})
