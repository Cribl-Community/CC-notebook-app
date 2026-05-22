/**
 * Editor helpers for `%%cribl_api` cells: YAML body region (line 2+), aligned with
 * `parseCriblApiMagic`.
 */
import { RangeSetBuilder } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

import {
  findFirstMagicHeaderLineIndex,
  offsetAfterLineWithNewline,
  offsetOfLineStart,
} from '@/domain/criblCellMagicSource'

const MAGIC_FIRST_LINE = /^%%cribl_api(?:\s+(.*))?$/

export type CriblApiCellInfo =
  | { kind: 'none' }
  | { kind: 'cribl_api'; yamlFrom: number; yamlTo: number; magicHeaderLineFrom: number }

export function analyzeCriblApiCell(code: string): CriblApiCellInfo {
  const text = code.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const headerIdx = findFirstMagicHeaderLineIndex(lines)
  if (headerIdx < 0) return { kind: 'none' }
  const firstLine = (lines[headerIdx] ?? '').trimStart().trimEnd()
  if (!MAGIC_FIRST_LINE.test(firstLine)) return { kind: 'none' }
  const magicHeaderLineFrom = offsetOfLineStart(text, lines, headerIdx)
  const yamlFrom = offsetAfterLineWithNewline(text, lines, headerIdx)
  return { kind: 'cribl_api', yamlFrom, yamlTo: text.length, magicHeaderLineFrom }
}

function buildDecorations(view: EditorView): DecorationSet {
  const code = view.state.doc.toString()
  const info = analyzeCriblApiCell(code)
  if (info.kind !== 'cribl_api' || info.yamlFrom >= info.yamlTo) return Decoration.none
  const builder = new RangeSetBuilder<Decoration>()
  builder.add(info.yamlFrom, info.yamlTo, Decoration.mark({ class: 'nb-cribl-api-yaml' }))
  return builder.finish()
}

export const criblApiYamlHighlightPlugin = ViewPlugin.fromClass(
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
