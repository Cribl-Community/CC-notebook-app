import { useMemo } from 'react'
import DOMPurify from 'dompurify'
import { marked } from 'marked'
import type { MimeBundle, MimeMetadata } from '../pyodide/types'
import { CRIBL_SEARCH_MIME, type CriblSearchPayload } from '../pyodide/types'
import { CriblSearchOutputView } from './CriblSearchOutput'
import { PlotlyMimeView } from './PlotlyMimeView'
import { VegaMimeView } from './VegaMimeView'
import { pickRenderer, registerMimeRenderer } from './mimeRegistry'

function HtmlMime({ data }: { data: string }) {
  const safe = useMemo(
    () =>
      DOMPurify.sanitize(data, {
        ADD_TAGS: ['iframe'],
        ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'scrolling', 'srcdoc', 'sandbox'],
        FORBID_TAGS: ['script'],
      }),
    [data],
  )
  return <div className="nb-mime-html" dangerouslySetInnerHTML={{ __html: safe }} />
}

function SvgMime({ data }: { data: string }) {
  const safe = useMemo(
    () => DOMPurify.sanitize(data, { USE_PROFILES: { svg: true, svgFilters: true } }),
    [data],
  )
  return <div className="nb-mime-svg" dangerouslySetInnerHTML={{ __html: safe }} />
}

function ImageMime({ data, mime }: { data: string; mime: string }) {
  return (
    <img
      className="nb-mime-image"
      src={`data:${mime};base64,${data.replace(/\s+/g, '')}`}
      alt=""
    />
  )
}

function MarkdownMime({ data }: { data: string }) {
  const html = useMemo(() => {
    const rendered = marked.parse(data, { async: false }) as string
    return DOMPurify.sanitize(rendered, {
      ADD_TAGS: ['iframe'],
      FORBID_TAGS: ['script'],
    })
  }, [data])
  return <div className="nb-mime-markdown" dangerouslySetInnerHTML={{ __html: html }} />
}

function JsonMime({ data }: { data: string }) {
  const pretty = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(data), null, 2)
    } catch {
      return data
    }
  }, [data])
  return <pre className="nb-output-pre nb-mime-json">{pretty}</pre>
}

function PlainMime({ data }: { data: string }) {
  return <pre className="nb-output-pre">{data}</pre>
}

function CriblSearchMime({ data }: { data: string }) {
  const payload = useMemo((): CriblSearchPayload | null => {
    try {
      const p = JSON.parse(data) as CriblSearchPayload
      if (p && (p.kind === 'running' || p.kind === 'completed' || p.kind === 'failed')) {
        return p
      }
    } catch {
      // fallthrough
    }
    return null
  }, [data])
  if (!payload) return <PlainMime data={data} />
  return <CriblSearchOutputView payload={payload} />
}

function WidgetFallback() {
  return (
    <pre className="nb-output-pre nb-mime-widget-fallback">
      [Jupyter widget — interactive rendering not yet implemented]
    </pre>
  )
}

let registered = false
function ensureRegistered() {
  if (registered) return
  registered = true
  registerMimeRenderer({
    mime: CRIBL_SEARCH_MIME,
    rank: 100,
    render: (data) => <CriblSearchMime data={data} />,
  })
  registerMimeRenderer({
    mime: 'application/vnd.jupyter.widget-view+json',
    rank: 90,
    render: () => <WidgetFallback />,
  })
  registerMimeRenderer({
    mime: 'application/vnd.plotly.v1+json',
    rank: 86,
    render: (plotlyData) => <PlotlyMimeView key={plotlyData} data={plotlyData} />,
  })
  /** Vega-Lite 5/6 (+json and Altair’s historic “.json” suffix). */
  for (const mime of [
    'application/vnd.vegalite.v5+json',
    'application/vnd.vegalite.v6+json',
    'application/vnd.vegalite.v6.json',
  ] as const) {
    registerMimeRenderer({
      mime,
      rank: 84,
      render: (spec) => <VegaMimeView key={spec} data={spec} />,
    })
  }
  /** Vega 5/6 (Vega-Lite is preferred when both appear). */
  for (const mime of [
    'application/vnd.vega.v5+json',
    'application/vnd.vega.v6+json',
    'application/vnd.vega.v6.json',
  ] as const) {
    registerMimeRenderer({
      mime,
      rank: 83,
      render: (spec) => <VegaMimeView key={spec} data={spec} />,
    })
  }
  registerMimeRenderer({
    mime: 'text/html',
    rank: 80,
    render: (data) => <HtmlMime data={data} />,
  })
  registerMimeRenderer({
    mime: 'image/svg+xml',
    rank: 75,
    render: (data) => <SvgMime data={data} />,
  })
  registerMimeRenderer({
    mime: 'image/png',
    rank: 70,
    render: (data) => <ImageMime data={data} mime="image/png" />,
  })
  registerMimeRenderer({
    mime: 'image/jpeg',
    rank: 70,
    render: (data) => <ImageMime data={data} mime="image/jpeg" />,
  })
  registerMimeRenderer({
    mime: 'text/markdown',
    rank: 60,
    render: (data) => <MarkdownMime data={data} />,
  })
  registerMimeRenderer({
    mime: 'application/json',
    rank: 50,
    render: (data) => <JsonMime data={data} />,
  })
  registerMimeRenderer({
    mime: 'text/plain',
    rank: 0,
    render: (data) => <PlainMime data={data} />,
  })
}
ensureRegistered()

export function MimeBundleView({
  data,
  metadata,
}: {
  data: MimeBundle
  metadata: MimeMetadata
}) {
  const renderer = pickRenderer(data)
  if (renderer) {
    const value = data[renderer.mime]
    if (typeof value === 'string') return <>{renderer.render(value, metadata)}</>
  }
  const tp = data['text/plain']
  return <PlainMime data={typeof tp === 'string' ? tp : ''} />
}
