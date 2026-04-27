import { type CompletionContext, type CompletionResult } from '@codemirror/autocomplete'
import type { Extension } from '@codemirror/state'
import { EditorView, type Tooltip, hoverTooltip, tooltips } from '@codemirror/view'
import { findCriblApiCatalogEntry, listCriblApiPathCompletions } from '@features/cribl-api/criblApiCatalog'
import { getCriblApiPathEditContext } from '@features/cribl-api/criblApiPathLine'
import { parseCriblApiMagic } from '@features/cribl-api/criblApiMagic'
import { analyzeCriblApiCell } from '@features/cribl-api/editor/criblApiEditor'
import type { CriblApiCatalogEntry } from '@features/cribl-api/criblApiCatalogTypes'
import { stringify } from 'yaml'

function isEmptyCriblApiYaml(code: string): boolean {
  const a = analyzeCriblApiCell(code)
  if (a.kind !== 'cribl_api') return false
  if (a.yamlFrom >= a.yamlTo) return true
  return code.slice(a.yamlFrom, a.yamlTo).trim() === ''
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

export function formatJsonBodySampleYaml(j: Record<string, unknown>): string {
  return `json:\n${stringify(j, { lineWidth: 0 })
    .split('\n')
    .map((line) => (line ? `  ${line}` : '  '))
    .join('\n')}\n`
}

function sampleJsonYamlForOp(op: CriblApiCatalogEntry): string {
  if (!op.jsonBody) return ''
  return formatJsonBodySampleYaml(op.jsonBody)
}

export function applyCriblApiPathCompletion(
  view: EditorView,
  from: number,
  to: number,
  newPath: string,
  op: CriblApiCatalogEntry,
): void {
  const before = view.state.doc.toString()
  const wasEmpty = isEmptyCriblApiYaml(before)
  view.dispatch({ changes: { from, to, insert: newPath } })
  const want = wasEmpty && BODY_METHODS.has(op.method) && op.jsonBody
  if (!want) return
  const y = sampleJsonYamlForOp({ ...op, path: newPath })
  if (!y) return
  queueMicrotask(() => {
    const t = view.state.doc.toString()
    const a = analyzeCriblApiCell(t)
    if (a.kind !== 'cribl_api') return
    if (a.yamlFrom < a.yamlTo && t.slice(a.yamlFrom, a.yamlTo).trim() !== '') return
    const at = a.yamlTo
    if (at > 0 && t[at - 1] === '\n') {
      view.dispatch({ changes: { from: at, to: at, insert: y } })
    } else if (at > 0) {
      view.dispatch({ changes: { from: at, to: at, insert: `\n${y}` } })
    } else {
      view.dispatch({ changes: { from: at, to: at, insert: y } })
    }
  })
}

export function criblApiCompletionSource(ctx: CompletionContext): CompletionResult | null {
  const { state } = ctx
  const line = state.doc.lineAt(ctx.pos)
  if (line.number !== 1) return null
  const ed = getCriblApiPathEditContext(line.text, line.from, ctx.pos)
  if (!ed) return null
  const cands = listCriblApiPathCompletions(ed.method, ed.pathPrefix)
  if (!cands.length) return null
  return {
    from: ed.pathFrom,
    to: ed.pathTo,
    filter: false,
    options: cands.map((op) => ({
      label: op.path,
      type: 'property' as const,
      detail: op.summary,
      apply: (v, _c, f, t) => applyCriblApiPathCompletion(v, f, t, op.path, op),
    })),
  }
}

/** `%%cribl_api` through end of the path token. */
function methodPathRegionInFirstLine(
  firstLine: string,
  path: string,
): { from: number; to: number } | null {
  const head = firstLine.match(/^\s*%%cribl_api\s+/)
  if (!head) return null
  const h = head[0]!.length
  const mrest = firstLine.slice(h)
  const mm = /^(GET|POST|PUT|PATCH|DELETE)\b/.exec(mrest)
  if (!mm) return null
  let p = h + mm[0]!.length
  while (p < firstLine.length && (firstLine[p] === ' ' || firstLine[p] === '\t')) p++
  if (!path || firstLine.slice(p, p + path.length) !== path) return null
  return { from: h, to: p + path.length }
}

export function createCriblApiFirstLineTooltipExtension(): readonly Extension[] {
  return [
    tooltips(),
    hoverTooltip(
      (view, pos) => {
        if (pos < 0) return null
        const l = view.state.doc.lineAt(pos)
        if (l.number !== 1) return null
        if (!/^\s*%%cribl_api\b/.test(l.text)) return null
        const p = parseCriblApiMagic(`${l.text}\n`)
        if (p.kind !== 'cribl_api') return null
        const { method, path } = p.value
        const span = methodPathRegionInFirstLine(l.text, path)
        if (!span) return null
        if (pos < l.from + span.from || pos > l.from + span.to) return null
        const op = findCriblApiCatalogEntry(method, path)
        const text = op
          ? [op.summary, op.description].filter(Boolean).join('\n\n')
          : `${method} ${path}`.trim()
        if (!text) return null
        const t: Tooltip = {
          pos: l.from + span.from,
          end: l.from + span.to,
          above: true,
          create: () => {
            const dom = document.createElement('div')
            dom.className = 'nb-cribl-api-tt'
            dom.textContent = text
            const st = (dom.style as unknown as { maxWidth: string; lineHeight: string; fontSize: string; whiteSpace: string; padding: string })
            st.maxWidth = '32rem'
            st.lineHeight = '1.4'
            st.fontSize = '12px'
            st.whiteSpace = 'pre-wrap'
            st.padding = '4px 6px'
            return { dom, resize: true }
          },
        }
        return t
      },
      { hideOnChange: true, hoverTime: 300 },
    ),
  ]
}
