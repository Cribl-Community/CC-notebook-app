import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state'
import {
  autocompletion,
  completionKeymap,
  completionStatus,
  startCompletion,
  moveCompletionSelection,
} from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { python } from '@codemirror/lang-python'
import { bracketMatching, HighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { EditorView, keymap, placeholder } from '@codemirror/view'
import type { CompletionItem } from '@ports/KernelPort'
import {
  criblApiCompletionSource,
  createCriblApiFirstLineTooltipExtension,
} from '@features/cribl-api/editor/criblApiCompletions'
import { criblApiYamlHighlightPlugin } from '@features/cribl-api/editor/criblApiEditor'
import { getCriblApiPathEditContext } from '@features/cribl-api/criblApiPathLine'
import { criblSearchCompletionSource, criblSearchKqlHighlightPlugin } from '@features/cribl-search'

/** Capra light/dark Python token colors (`--nb-cm-*` from capra-nb-bridge.css). */
const jupyterPythonHighlight = HighlightStyle.define([
  { tag: tags.moduleKeyword, color: 'var(--nb-cm-keyword-strong)', fontWeight: 'bold' },
  { tag: tags.controlKeyword, color: 'var(--nb-cm-keyword-strong)', fontWeight: 'bold' },
  { tag: tags.definitionKeyword, color: 'var(--nb-cm-keyword-strong)', fontWeight: 'bold' },
  { tag: tags.operatorKeyword, color: 'var(--nb-cm-operator-keyword)', fontWeight: 'bold' },
  { tag: tags.keyword, color: 'var(--nb-cm-keyword)' },
  { tag: tags.string, color: 'var(--nb-cm-string)' },
  { tag: tags.special(tags.string), color: 'var(--nb-cm-string)' },
  { tag: tags.escape, color: 'var(--nb-cm-string)' },
  { tag: tags.lineComment, color: 'var(--nb-cm-comment)', fontStyle: 'italic' },
  { tag: tags.blockComment, color: 'var(--nb-cm-comment)', fontStyle: 'italic' },
  { tag: tags.docComment, color: 'var(--nb-cm-comment)', fontStyle: 'italic' },
  { tag: tags.number, color: 'var(--nb-cm-number)' },
  { tag: tags.bool, color: 'var(--nb-cm-bool-null)' },
  { tag: tags.null, color: 'var(--nb-cm-bool-null)' },
  { tag: tags.definition(tags.className), color: 'var(--nb-cm-def-name)', fontWeight: 'bold' },
  { tag: tags.definition(tags.variableName), color: 'var(--nb-cm-def-name)', fontWeight: 'bold' },
  { tag: tags.className, color: 'var(--nb-cm-def-name)' },
  { tag: tags.function(tags.variableName), color: 'var(--nb-cm-function)' },
  { tag: tags.function(tags.propertyName), color: 'var(--nb-cm-function)' },
  { tag: tags.propertyName, color: 'var(--nb-cm-property)' },
  { tag: tags.variableName, color: 'var(--nb-cm-name)' },
  { tag: tags.namespace, color: 'var(--nb-cm-name)' },
  { tag: tags.meta, color: 'var(--nb-cm-meta)' },
  { tag: tags.modifier, color: 'var(--nb-cm-keyword-strong)' },
  { tag: tags.operator, color: 'var(--nb-cm-operator)' },
  { tag: tags.punctuation, color: 'var(--nb-cm-punctuation)' },
  { tag: tags.brace, color: 'var(--nb-cm-punctuation)' },
  { tag: tags.squareBracket, color: 'var(--nb-cm-punctuation)' },
  { tag: tags.paren, color: 'var(--nb-cm-punctuation)' },
  { tag: tags.separator, color: 'var(--nb-cm-punctuation)' },
  { tag: tags.invalid, color: 'var(--nb-cm-invalid)' },
])

/** Same line-based rule as `notebook_complete.py` for `from`/`to` in the editor. */
export function completionReplaceBounds(code: string, pos: number): { from: number; to: number } {
  const before = code.slice(0, pos)
  const lastNl = before.lastIndexOf('\n')
  const line = before.slice(lastNl + 1)
  const j = line.length
  let i = j - 1
  while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i]!)) {
    i--
  }
  const partialLen = j - (i + 1)
  const from = pos - partialLen
  const to = pos
  return { from, to }
}

const kindToCmType: Record<CompletionItem['kind'], string> = {
  module: 'namespace',
  class: 'class',
  function: 'function',
  instance: 'property',
}

export function createPythonCellExtensions(options: {
  theme: 'dark' | 'light'
  readOnlyCompartment: Compartment
  readOnly: boolean
  placeholderText: string
  onRun: () => void
  getComplete: () => ((code: string, pos: number) => Promise<CompletionItem[] | null>) | undefined
}): Extension[] {
  const cellTheme = EditorView.theme(
    {
      '&': {
        fontSize: '13px',
        lineHeight: '1.65',
        fontFamily: 'var(--mono)',
        minHeight: '40px',
      },
      '&.cm-editor': {
        backgroundColor: 'transparent',
      },
      '.cm-scroller': {
        overflow: 'auto',
        fontFamily: 'var(--mono)',
      },
      '.cm-content': {
        padding: '8px 12px',
        caretColor: 'var(--nb-code-caret)',
        color: 'var(--nb-text)',
      },
      '.cm-cursor, .cm-dropCursor': {
        borderLeftColor: 'var(--nb-code-caret) !important',
      },
      '.cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--nb-code-selection-bg) !important',
      },
      '.cm-activeLine': {
        backgroundColor: 'transparent',
      },
      '.cm-gutters': {
        display: 'none',
      },
      '.cm-matchingBracket': {
        backgroundColor: 'var(--nb-cm-bracket-match-bg)',
        outline: '1px solid var(--nb-cm-bracket-match-outline)',
        borderRadius: '2px',
      },
      '.cm-nonmatchingBracket': {
        backgroundColor: 'var(--nb-error-bg)',
        outline: '1px solid var(--nb-error-border)',
      },
      '.cm-completionList': {
        fontFamily: 'var(--mono)',
      },
      '.cm-completionLabel': {
        fontFamily: 'var(--mono)',
      },
      '.cm-completionDetail': {
        fontFamily: 'var(--mono)',
        opacity: '0.72',
      },
    },
    { dark: options.theme === 'dark' },
  )

  /** Tab cycles the completion list; Enter accepts (see `completionEnter`). */
  const completionTabCycle = keymap.of([
    {
      key: 'Tab',
      run: (view) => {
        const st = completionStatus(view.state)
        if (st === 'active') {
          return moveCompletionSelection(true)(view)
        }
        return startCompletion(view)
      },
    },
    {
      key: 'Shift-Tab',
      run: (view) => {
        if (completionStatus(view.state) === 'active') {
          return moveCompletionSelection(false)(view)
        }
        return false
      },
    },
  ])

  const runCell = keymap.of([
    {
      key: 'Shift-Enter',
      run: () => {
        options.onRun()
        return true
      },
    },
  ])

  const completionOverride = autocompletion({
    activateOnTyping: false,
    maxRenderedOptions: 80,
    defaultKeymap: false,
    override: [
      (context) => criblApiCompletionSource(context),
      (context) => criblSearchCompletionSource(context),
      async (context) => {
        const code = context.state.doc.toString()
        const pos = context.pos
        const line = context.state.doc.lineAt(pos)
        if (line.number === 1 && getCriblApiPathEditContext(line.text, line.from, pos)) {
          return null
        }
        const getComplete = options.getComplete()
        if (!getComplete) return null
        const items = await getComplete(code, pos)
        if (!items?.length) return null
        const { from, to } = completionReplaceBounds(code, pos)
        return {
          from,
          to,
          options: items.map((it) => ({
            label: it.name,
            type: kindToCmType[it.kind] ?? 'property',
            detail: it.kind,
          })),
        }
      },
    ],
  })

  return [
    cellTheme,
    ...createCriblApiFirstLineTooltipExtension(),
    python(),
    syntaxHighlighting(jupyterPythonHighlight),
    Prec.high(criblApiYamlHighlightPlugin),
    Prec.high(criblSearchKqlHighlightPlugin),
    bracketMatching(),
    indentOnInput(),
    history(),
    EditorState.tabSize.of(4),
    options.readOnlyCompartment.of(EditorState.readOnly.of(options.readOnly)),
    placeholder(options.placeholderText),
    /** Arrow/PageUp/PageDown/Enter/Escape from completionKeymap must beat defaultKeymap for list navigation + accept. */
    Prec.highest(keymap.of(completionKeymap)),
    Prec.highest(completionTabCycle),
    Prec.highest(runCell),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    completionOverride,
    EditorView.lineWrapping,
  ]
}
