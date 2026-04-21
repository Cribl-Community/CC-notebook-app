import { useEffect, useMemo, useState } from 'react'
import type { Config, Data, Frame, Layout } from 'plotly.js'

type PlotlyFigureJson = {
  data?: Data[]
  layout?: Partial<Layout>
  frames?: Frame[]
  config?: Partial<Config>
}

function parseFigure(data: string): PlotlyFigureJson | null {
  try {
    const o = JSON.parse(data) as unknown
    if (o && typeof o === 'object') {
      return o as PlotlyFigureJson
    }
  } catch {
    // fallthrough
  }
  return null
}

/**
 * Renders Plotly's Jupyter MIME (`application/vnd.plotly.v1+json`).
 * Loads `react-plotly.js` on first use to keep the main bundle smaller.
 */
export function PlotlyMimeView({ data }: { data: string }) {
  const [Plot, setPlot] =
    useState<(typeof import('react-plotly.js'))['default'] | null>(null)

  const parsed = useMemo(() => parseFigure(data), [data])

  useEffect(() => {
    let cancelled = false
    void import('react-plotly.js').then((m) => {
      if (!cancelled) setPlot(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (parsed === null) {
    return <pre className="nb-output-pre">{data}</pre>
  }

  if (!Plot) {
    return <div className="nb-mime-chart-loading">Loading chart…</div>
  }

  const { data: plotData, layout, frames, config } = parsed
  const mergedConfig: Partial<Config> = {
    responsive: true,
    displayModeBar: true,
    ...config,
  }

  return (
    <div className="nb-mime-plotly js-plotly-plot">
      <Plot
        data={plotData ?? []}
        layout={layout ?? {}}
        frames={frames}
        config={mergedConfig}
        useResizeHandler
        style={{ width: '100%', minHeight: 360 }}
      />
    </div>
  )
}
