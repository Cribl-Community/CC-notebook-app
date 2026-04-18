import { useRef, useEffect, useCallback } from 'react'
import type { CodeCell as CellData } from './types'
import { CellOutput } from './CellOutput'

interface CodeCellProps {
  cell: CellData
  isSelected: boolean
  onSelect: () => void
  onRun: () => void
  onDelete: () => void
  onChange: (source: string) => void
}

function GutterLabel({ cell }: { cell: CellData }) {
  if (cell.execution_state === 'running') return <span>[*]</span>
  if (cell.execution_count !== null) return <span>[{cell.execution_count}]</span>
  return <span>[ ]</span>
}

export function CodeCell({ cell, isSelected, onSelect, onRun, onDelete, onChange }: CodeCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [cell.source])

  useEffect(() => {
    if (isSelected) textareaRef.current?.focus()
  }, [isSelected])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.shiftKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onRun()
      }
    },
    [onRun],
  )

  const isRunning = cell.execution_state === 'running'

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
            disabled={isRunning}
            title="Run cell (Shift+Enter)"
          >
            {isRunning ? '◼' : '▶'}
          </button>
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
        <textarea
          ref={textareaRef}
          className="nb-cell-editor"
          value={cell.source}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={onSelect}
          onClick={(e) => e.stopPropagation()}
          placeholder="# Enter Python code here…"
          spellCheck={false}
          rows={1}
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
