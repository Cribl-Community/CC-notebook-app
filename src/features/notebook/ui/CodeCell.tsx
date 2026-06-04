import { useRef, useEffect, useLayoutEffect, useCallback, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { CodeCell as CellData } from '@features/notebook/model/types'
import { CellOutput } from '@features/notebook/ui/CellOutput'
import { createPythonCellExtensions } from '@ui/editor/pythonCodeMirror'
import type { CompletionItem } from '@ports/KernelPort'
import { DEFAULT_RIPTIDE_PROMPT_PREFIX, parseRiptidePromptFromCellSource } from '@features/ai-riptide'
import { DEFAULT_RUN_CONDITION, codeCellCanToggleFold } from '@features/notebook/codeCellFold'

interface CodeCellProps {
  cell: CellData
  isSelected: boolean
  /** CodeMirror light/dark chrome; syntax comes from CSS variables. */
  codeMirrorLuma: 'light' | 'dark'
  onSelect: () => void
  onRun: () => void
  onDelete: () => void
  onChange: (source: string) => void
  onClearOutput: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onClone?: () => void
  onSetCodeFolded: (folded: boolean) => void
  onSetCellEnabled: (enabled: boolean) => void
  onSetRunCondition: (runCondition: string) => void
  /** Namespace-aware completion from the active tab's Pyodide kernel (Tab). */
  completeCode?: (code: string, cursor: number) => Promise<CompletionItem[] | null>
  /**
   * Generate Python from the inline prompt text (Riptide). Panel stays open for iteration.
   */
  onAiGenerateFromPrompt?: (prompt: string) => void | Promise<void>
  aiGenerateBusy?: boolean
}

function GutterLabel({ cell }: { cell: CellData }) {
  if (cell.execution_state === 'running' || cell.execution_state === 'pending') {
    return <span>[*]</span>
  }
  if (cell.execution_count !== null) return <span>[{cell.execution_count}]</span>
  return <span>[ ]</span>
}

export function CodeCell({
  cell,
  isSelected,
  codeMirrorLuma,
  onSelect,
  onRun,
  onDelete,
  onChange,
  onClearOutput,
  onMoveUp,
  onMoveDown,
  onClone,
  onSetCodeFolded,
  onSetCellEnabled,
  onSetRunCondition,
  completeCode,
  onAiGenerateFromPrompt,
  aiGenerateBusy = false,
}: CodeCellProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  /** Typed continuation after `DEFAULT_RIPTIDE_PROMPT_PREFIX` (prefix shown muted beside this field). */
  const [aiPromptSuffix, setAiPromptSuffix] = useState('')
  const aiPromptRef = useRef<HTMLTextAreaElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onRunRef = useRef(onRun)
  const onChangeRef = useRef(onChange)
  const onSelectRef = useRef(onSelect)
  const completeRef = useRef(completeCode)
  const readOnlyCompartmentRef = useRef<Compartment | null>(null)

  useEffect(() => {
    onRunRef.current = onRun
    onChangeRef.current = onChange
    onSelectRef.current = onSelect
    completeRef.current = completeCode
  })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const readOnlyCompartment = new Compartment()
    readOnlyCompartmentRef.current = readOnlyCompartment

    const extensions = createPythonCellExtensions({
      theme: codeMirrorLuma,
      readOnlyCompartment,
      readOnly: cell.execution_state === 'running',
      placeholderText: '# Enter Python code here…',
      onRun: () => onRunRef.current(),
      getComplete: () => completeRef.current ?? undefined,
    })

    const state = EditorState.create({
      doc: cell.source,
      extensions: [
        ...extensions,
        EditorView.updateListener.of((u) => {
          if (u.focusChanged && u.view.hasFocus) {
            onSelectRef.current()
          }
          if (u.docChanged) {
            onChangeRef.current(u.state.doc.toString())
          }
        }),
      ],
    })

    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // Editor is tied to cell identity and luma; document text and read-only are updated in other effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [cell.id, codeMirrorLuma])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const cur = view.state.doc.toString()
    if (cur !== cell.source) {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: cell.source },
      })
    }
  }, [cell.source])

  useEffect(() => {
    const view = viewRef.current
    const comp = readOnlyCompartmentRef.current
    if (!view || !comp) return
    view.dispatch({
      effects: comp.reconfigure(EditorState.readOnly.of(cell.execution_state === 'running')),
    })
  }, [cell.execution_state])

  useEffect(() => {
    if (isSelected) viewRef.current?.focus()
  }, [isSelected])

  const onEditorMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const syncAiPromptHeight = useCallback(() => {
    const el = aiPromptRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [])

  useLayoutEffect(() => {
    if (!aiPanelOpen) return
    syncAiPromptHeight()
  }, [aiPanelOpen, aiPromptSuffix, syncAiPromptHeight])

  useEffect(() => {
    if (!aiPanelOpen) return
    const id = window.setTimeout(() => {
      const el = aiPromptRef.current
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    }, 0)
    return () => window.clearTimeout(id)
  }, [aiPanelOpen])

  const handleAiToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setAiPanelOpen((wasOpen) => {
        if (wasOpen) return false
        const parsed = parseRiptidePromptFromCellSource(cell.source)
        queueMicrotask(() => {
          if (parsed !== null) {
            const suffix = parsed.startsWith(DEFAULT_RIPTIDE_PROMPT_PREFIX)
              ? parsed.slice(DEFAULT_RIPTIDE_PROMPT_PREFIX.length)
              : parsed
            setAiPromptSuffix(suffix)
          } else {
            setAiPromptSuffix('')
          }
        })
        return true
      })
    },
    [cell.source],
  )

  const fullAiPrompt = `${DEFAULT_RIPTIDE_PROMPT_PREFIX}${aiPromptSuffix}`.trim()

  const handleAiPanelGenerate = useCallback(() => {
    if (!fullAiPrompt || !onAiGenerateFromPrompt) return
    void onAiGenerateFromPrompt(fullAiPrompt)
  }, [fullAiPrompt, onAiGenerateFromPrompt])

  const isBusy = cell.execution_state === 'running' || cell.execution_state === 'pending'
  const isRunning = cell.execution_state === 'running'
  const canClearOutput = cell.outputs.length > 0 || cell.execution_count !== null
  const canFold = codeCellCanToggleFold(cell)
  const folded = cell.codeFolded === true
  const cellEnabled = cell.enabled !== false

  return (
    <div
      className={`nb-cell${isSelected ? ' nb-cell--selected' : ''}${!cellEnabled ? ' nb-cell--disabled' : ''}`}
      onClick={onSelect}
    >
      <div className="nb-cell-gutter">
        <GutterLabel cell={cell} />
      </div>
      <div className="nb-cell-body">
        <div className="nb-cell-toolbar">
          <div className="nb-cell-toolbar-group">
            <button
              className="nb-btn nb-btn-run"
              onClick={(e) => {
                e.stopPropagation()
                onRun()
              }}
              disabled={isBusy || !cellEnabled}
              title={
                !cellEnabled
                  ? 'Cell is disabled — turn On in the toolbar to run'
                  : 'Run cell (Shift+Enter)'
              }
            >
              {isBusy ? '◼' : '▶'}
            </button>
            <button
              type="button"
              className={`nb-btn nb-btn-cell-enabled${cellEnabled ? ' nb-btn-cell-enabled--on' : ''}`}
              aria-pressed={cellEnabled}
              onClick={(e) => {
                e.stopPropagation()
                onSetCellEnabled(!cellEnabled)
              }}
              title={cellEnabled ? 'Cell is enabled (click to disable)' : 'Cell is disabled (click to enable)'}
            >
              {cellEnabled ? 'On' : 'Off'}
            </button>
            <label className="nb-cell-condition-label">
              <span className="nb-cell-condition-label-text">If</span>
              <input
                type="text"
                className="nb-cell-condition-input"
                value={cell.runCondition ?? ''}
                placeholder={DEFAULT_RUN_CONDITION}
                spellCheck={false}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onChange={(e) => onSetRunCondition(e.target.value)}
                title="Python expression — cell body runs only when this is true"
                aria-label="Run condition (Python expression)"
              />
              {cell.conditionOutcome != null && (
                <span
                  className={`nb-cell-condition-badge nb-cell-condition-badge--${cell.conditionOutcome}`}
                  title={
                    cell.conditionOutcome === 'true'
                      ? 'Last run: condition true (body ran)'
                      : cell.conditionOutcome === 'false'
                        ? 'Last run: condition false (body skipped)'
                        : 'Last run: condition raised an error (body skipped)'
                  }
                >
                  {cell.conditionOutcome === 'true' ? 'T' : cell.conditionOutcome === 'false' ? 'F' : 'E'}
                </span>
              )}
            </label>
            {canFold && (
              <button
                type="button"
                className="nb-btn nb-btn-code-fold"
                onClick={(e) => {
                  e.stopPropagation()
                  onSetCodeFolded(!folded)
                }}
                aria-expanded={!folded}
                title={folded ? 'Show full code editor' : 'Collapse code to about ten lines'}
              >
                {folded ? 'Show' : 'Fold'}
              </button>
            )}
          </div>
          <div className="nb-cell-toolbar-spacer" aria-hidden />
          <div className="nb-cell-toolbar-group">
            <button
              className="nb-btn nb-btn-move"
              onClick={(e) => {
                e.stopPropagation()
                onMoveUp?.()
              }}
              disabled={!onMoveUp}
              title="Move cell up"
            >
              ▲
            </button>
            <button
              className="nb-btn nb-btn-move"
              onClick={(e) => {
                e.stopPropagation()
                onMoveDown?.()
              }}
              disabled={!onMoveDown}
              title="Move cell down"
            >
              ▼
            </button>
            <button
              className="nb-btn nb-btn-clear-output"
              onClick={(e) => {
                e.stopPropagation()
                onClearOutput()
              }}
              disabled={!canClearOutput || isRunning}
              title="Clear cell output (available while queued; not while executing)"
            >
              ⌫
            </button>
            {onAiGenerateFromPrompt && (
              <button
                type="button"
                className={`nb-btn nb-btn-ai${aiPanelOpen ? ' nb-btn-ai--active' : ''}`}
                onClick={handleAiToggle}
                disabled={isBusy || aiGenerateBusy}
                title="Show or hide Riptide prompt (inline, above the editor)"
                aria-expanded={aiPanelOpen}
              >
                AI
              </button>
            )}
            <button
              type="button"
              className="nb-btn nb-btn-clone"
              onClick={(e) => {
                e.stopPropagation()
                onClone?.()
              }}
              disabled={!onClone}
              title="Duplicate cell below"
            >
              ⧉ Clone
            </button>
          </div>
          <div className="nb-cell-toolbar-group nb-cell-toolbar-group--end">
            <button
              className="nb-btn nb-btn-delete"
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              title="Delete cell"
            >
              ✕
            </button>
          </div>
        </div>
        {onAiGenerateFromPrompt && aiPanelOpen && (
          <div
            className="nb-cell-ai-panel"
            role="region"
            aria-label="Riptide prompt"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <label className="nb-cell-ai-field" htmlFor={`nb-ai-prompt-${cell.id}`}>
              <span className="nb-cell-ai-field-label">Prompt</span>
              <div className="nb-cell-ai-prompt-row">
                <span className="nb-cell-ai-prefix" aria-hidden>
                  {DEFAULT_RIPTIDE_PROMPT_PREFIX}
                </span>
                <textarea
                  ref={aiPromptRef}
                  id={`nb-ai-prompt-${cell.id}`}
                  className="nb-cell-ai-prompt"
                  rows={1}
                  autoComplete="off"
                  value={aiPromptSuffix}
                  onChange={(e) => setAiPromptSuffix(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.shiftKey) {
                      e.preventDefault()
                      handleAiPanelGenerate()
                    }
                  }}
                  placeholder="Describe the code…"
                  disabled={aiGenerateBusy}
                  aria-label="Continue the Riptide prompt after “Generate Python code that”"
                />
              </div>
            </label>
            <div className="nb-cell-ai-actions">
              <button
                type="button"
                className="nb-btn nb-btn-primary nb-cell-ai-generate"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAiPanelGenerate()
                }}
                disabled={isBusy || aiGenerateBusy || fullAiPrompt === ''}
              >
                {aiGenerateBusy ? '…' : 'Generate'}
              </button>
              <button
                type="button"
                className="nb-btn"
                onClick={(e) => {
                  e.stopPropagation()
                  setAiPanelOpen(false)
                }}
              >
                Close
              </button>
            </div>
            <p className="nb-cell-ai-hint">
              Shift+Enter runs Generate. Edit the prompt and generate again to iterate. Optional Jinja2 in the prompt:
              use {'{{ name }}'} for notebook variables and {'{{ x | describe }}'} / {'{{ x | type_name }}'} for structured
              values from the kernel.
            </p>
          </div>
        )}
        <div
          className={`nb-cell-editor-clip${folded && canFold ? ' nb-cell-editor-clip--folded' : ''}`}
        >
          <div
            ref={hostRef}
            className="nb-cell-editor nb-cell-editor-cm"
            onMouseDown={onEditorMouseDown}
          />
        </div>
        {cell.outputs.length > 0 && (
          <div className="nb-cell-outputs">
            {cell.outputs.map((output, i) => (
              <CellOutput key={i} output={output} cellSource={cell.source} onReplaceCellSource={onChange} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
