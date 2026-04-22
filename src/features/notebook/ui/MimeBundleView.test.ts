import { describe, expect, it } from 'vitest'
import { pickRenderer } from '@features/notebook/ui/mimeRegistry'
import '@features/notebook/ui/MimeBundleView'

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

  it('selects Vega 6 (.json suffix) over HTML (Altair default bundle shape)', () => {
    const r = pickRenderer({
      'application/vnd.vega.v6.json': '{"$schema":"https://vega.github.io/schema/vega/v6.json"}',
      'text/html': '<div id="v"><script></script></div>',
      'text/plain': 'Chart(...)',
    })
    expect(r?.mime).toBe('application/vnd.vega.v6.json')
  })

  it('prefers Vega MIME over Jupyter widget stub when both exist (Altair bundle)', () => {
    const r = pickRenderer({
      'application/vnd.vega.v6.json': '{"$schema":"https://vega.github.io/schema/vega/v6.json"}',
      'application/vnd.jupyter.widget-view+json': '{"version_major":2,"version_minor":0}',
      'text/plain': 'Chart(...)',
    })
    expect(r?.mime).toBe('application/vnd.vega.v6.json')
  })
})
