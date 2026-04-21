import { useRef, useEffect, useCallback, useState } from 'react'
import { Compartment, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { CodeCell as CellData } from './types'
import { CellOutput } from './CellOutput'
import { createPythonCellExtensions } from './pythonCodeMirror'
import type { CompletionItem } from '../pyodide/types'
import { DEFAULT_RIPTIDE_PROMPT_PREFIX } from '../cribl/riptideCode'

interface CodeCellProps {
  cell: CellData
  isSelected: boolean
  theme: 'dark' | 'light'
  onSelect: () => void
  onRun: () => void
  onDelete: () => void
  onChange: (source: string) => void
  onClearOutput: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
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
  theme,
  onSelect,
  onRun,
  onDelete,
  onChange,
  onClearOutput,
  onMoveUp,
  onMoveDown,
  completeCode,
  onAiGenerateFromPrompt,
  aiGenerateBusy = false,
}: CodeCellProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiPromptText, setAiPromptText] = useState('')
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
      theme,
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
    // Editor is tied to cell identity and theme; document text and read-only are updated in other effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [cell.id, theme])

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

  useEffect(() => {
    if (!aiPanelOpen) return
    const id = window.setTimeout(() => aiPromptRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [aiPanelOpen])

  const handleAiToggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setAiPanelOpen((wasOpen) => {
      if (wasOpen) return false
      setAiPromptText((t) => (t.trim() === '' ? DEFAULT_RIPTIDE_PROMPT_PREFIX : t))
      return true
    })
  }, [])

  const handleAiPanelGenerate = useCallback(() => {
    const p = aiPromptText.trim()
    if (!p || !onAiGenerateFromPrompt) return
    void onAiGenerateFromPrompt(p)
  }, [aiPromptText, onAiGenerateFromPrompt])

  const isBusy = cell.execution_state === 'running' || cell.execution_state === 'pending'
  const isRunning = cell.execution_state === 'running'
  const canClearOutput = cell.outputs.length > 0 || cell.execution_count !== null

  return (
    <div
      className={`nb-cell${isSelected ? ' nb-cell--selected' : ''}`}
      onClick={onSelect}
    >
      <div className="nb-cell-gutter">
        <GutterLabel cell={cell} />
      </div>
      <div className="nb-cell-body">
        <div className="nb-cell-toolbar">
          <button
            className="nb-btn nb-btn-run"
            onClick={(e) => {
              e.stopPropagation()
              onRun()
            }}
            disabled={isBusy}
            title="Run cell (Shift+Enter)"
          >
            {isBusy ? '◼' : '▶'}
          </button>
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
        {onAiGenerateFromPrompt && aiPanelOpen && (
          <div
            className="nb-cell-ai-panel"
            role="region"
            aria-label="Riptide prompt"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <label className="nb-cell-ai-field">
              <span className="nb-cell-ai-field-label">Prompt</span>
              <textarea
                ref={aiPromptRef}
                className="nb-cell-ai-prompt"
                rows={4}
                value={aiPromptText}
                onChange={(e) => setAiPromptText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    handleAiPanelGenerate()
                  }
                }}
                placeholder="Describe the code…"
                disabled={aiGenerateBusy}
              />
            </label>
            <div className="nb-cell-ai-actions">
              <button
                type="button"
                className="nb-btn nb-btn-primary nb-cell-ai-generate"
                onClick={(e) => {
                  e.stopPropagation()
                  handleAiPanelGenerate()
                }}
                disabled={isBusy || aiGenerateBusy || aiPromptText.trim() === ''}
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
            <p className="nb-cell-ai-hint">Ctrl+Enter or ⌘ Enter runs Generate. Edit the prompt and generate again to iterate.</p>
          </div>
        )}
        <div
          ref={hostRef}
          className="nb-cell-editor nb-cell-editor-cm"
          onMouseDown={onEditorMouseDown}
        />
        {cell.outputs.length > 0 && (
          <div className="nb-cell-outputs">
            {cell.outputs.map((output, i) => (
              <CellOutput key={i} output={output} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
