import { useEffect, useMemo, useRef, useState } from 'react'

/**
 * Renders Vega or Vega-Lite specs from Jupyter MIME bundles
 * (`application/vnd.vega.v5+json`, `application/vnd.vegalite.v5+json`) via vega-embed.
 */
export function VegaMimeView({ data }: { data: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<{ finalize?: () => void } | null>(null)
  const [embedError, setEmbedError] = useState<string | null>(null)

  const spec = useMemo(() => {
    try {
      return JSON.parse(data) as object
    } catch {
      return null
    }
  }, [data])

  useEffect(() => {
    if (spec === null) return
    const el = containerRef.current
    if (!el) return

    let cancelled = false

    void import('vega-embed').then(({ default: vegaEmbed }) => {
      if (cancelled || !el.isConnected) return
      void vegaEmbed(el, spec, {
        actions: true,
        renderer: 'svg',
        tooltip: true,
      })
        .then((result) => {
          if (cancelled) {
            try {
              result.view.finalize()
            } catch {
              /* ignore */
            }
            return
          }
          viewRef.current = result.view
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setEmbedError(err instanceof Error ? err.message : String(err))
          }
        })
    })

    return () => {
      cancelled = true
      try {
        viewRef.current?.finalize?.()
      } catch {
        /* ignore */
      }
      viewRef.current = null
      el.innerHTML = ''
    }
  }, [spec])

  if (spec === null) {
    return <pre className="nb-output-pre">{data}</pre>
  }

  if (embedError) {
    return (
      <div className="nb-mime-vega nb-mime-vega-error">
        <pre className="nb-output-pre">{embedError}</pre>
      </div>
    )
  }

  return <div ref={containerRef} className="nb-mime-vega" data-testid="vega-mime-container" />
}
