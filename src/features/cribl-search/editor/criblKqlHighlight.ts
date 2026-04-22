import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { analyzeCriblSearchCell, tokenizeKqlRegion, type KqlTokenKind } from '@features/cribl-search/editor/criblSearchEditor'

function classForKind(k: KqlTokenKind): string {
  switch (k) {
    case 'keyword':
      return 'nb-kql-keyword'
    case 'pipe':
      return 'nb-kql-pipe'
    case 'string':
      return 'nb-kql-string'
    case 'number':
      return 'nb-kql-number'
    case 'identifier':
      return 'nb-kql-identifier'
    case 'operator':
      return 'nb-kql-operator'
    case 'comment':
      return 'nb-kql-comment'
    default:
      return 'nb-kql-identifier'
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const code = view.state.doc.toString()
  const info = analyzeCriblSearchCell(code)
  if (info.kind !== 'cribl_search' || info.kqlFrom >= info.kqlTo) return Decoration.none

  const tokens = tokenizeKqlRegion(code, info.kqlFrom, info.kqlTo)
  const builder = new RangeSetBuilder<Decoration>()
  for (const t of tokens) {
    builder.add(t.from, t.to, Decoration.mark({ class: classForKind(t.kind) }))
  }
  return builder.finish()
}

export const criblSearchKqlHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations },
)
