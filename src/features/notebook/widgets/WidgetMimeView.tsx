import { useEffect, useRef } from 'react'
import type { DOMWidgetModel } from '@jupyter-widgets/base'
import { useTabWidgetManager } from '@features/notebook/widgets/useTabWidgetManager'

export function WidgetMimeView({ viewJson }: { viewJson: string }) {
  const manager = useTabWidgetManager()
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!manager) return
    let cancelled = false
    let viewCleanup: { remove: () => void } | null = null
    const run = async () => {
      let spec: { model_id?: string }
      try {
        spec = JSON.parse(viewJson) as { model_id?: string }
      } catch {
        return
      }
      const modelId = spec.model_id
      if (!modelId) return
      try {
        const model = (await manager.get_model(modelId)) as DOMWidgetModel
        const el = hostRef.current
        if (!el || cancelled) return
        const view = await manager.create_view(model, { el })
        if (cancelled) {
          view.remove()
          return
        }
        viewCleanup = view
      } catch (e) {
        console.error('[WidgetMimeView] failed to attach widget view', e)
      }
    }
    void run()
    return () => {
      cancelled = true
      viewCleanup?.remove()
    }
  }, [manager, viewJson])

  if (!manager) {
    return (
      <pre className="nb-output-pre nb-mime-widget-fallback">
        [Jupyter widget — kernel not ready or manager unavailable]
      </pre>
    )
  }

  return <div ref={hostRef} className="nb-widget-host" data-testid="jupyter-widget-host" />
}
