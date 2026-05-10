import { useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { MarkdownCell as MarkdownCellData } from '@features/notebook/model/types'

interface MarkdownCellProps {
  cell: MarkdownCellData
  isSelected: boolean
  onSelect: () => void
  onToggleEdit: () => void
  onDelete: () => void
  onChange: (source: string) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  onClone?: () => void
}

function renderMarkdown(source: string): string {
  const raw = marked(source || '_Double-click to edit…_', { async: false })
  return DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'rel'],
  })
}

export function MarkdownCell({
  cell,
  isSelected,
  onSelect,
  onToggleEdit,
  onDelete,
  onChange,
  onMoveUp,
  onMoveDown,
  onClone,
}: MarkdownCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Auto-resize when in edit mode
  useEffect(() => {
    if (!cell.editing) return
    const ta = textareaRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${ta.scrollHeight}px`
  }, [cell.source, cell.editing])

  // Focus when entering edit mode
  useEffect(() => {
    if (cell.editing) textareaRef.current?.focus()
  }, [cell.editing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if ((e.shiftKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        onToggleEdit()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onToggleEdit()
      }
    },
    [onToggleEdit],
  )

  const cellClass = `nb-cell nb-cell--md${isSelected ? ' nb-cell--selected' : ''}`

  if (cell.editing) {
    return (
      <div className={cellClass} onClick={onSelect}>
        <div className="nb-cell-gutter nb-cell-gutter--md">M</div>
        <div className="nb-cell-body">
          <div className="nb-cell-toolbar">
            <button
              className="nb-btn nb-btn-md-done"
              onClick={(e) => {
                e.stopPropagation()
                onToggleEdit()
              }}
              title="Render (Shift+Enter)"
            >
              ✓ Done
            </button>
            <button
              className="nb-btn nb-btn-move"
              onClick={(e) => { e.stopPropagation(); onMoveUp?.() }}
              disabled={!onMoveUp}
              title="Move cell up"
            >
              ▲
            </button>
            <button
              className="nb-btn nb-btn-move"
              onClick={(e) => { e.stopPropagation(); onMoveDown?.() }}
              disabled={!onMoveDown}
              title="Move cell down"
            >
              ▼
            </button>
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
            className="nb-cell-editor nb-md-editor"
            value={cell.source}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={onSelect}
            onClick={(e) => e.stopPropagation()}
            placeholder="Write Markdown here… (Shift+Enter to render)"
            spellCheck
            rows={1}
          />
        </div>
      </div>
    )
  }

  return (
    <div
      className={cellClass}
      onClick={onSelect}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onToggleEdit()
      }}
    >
      <div className="nb-cell-gutter nb-cell-gutter--md">M</div>
      <div className="nb-cell-body">
        <div className="nb-cell-toolbar">
          <button
            className="nb-btn"
            onClick={(e) => {
              e.stopPropagation()
              onToggleEdit()
            }}
            title="Edit markdown"
          >
            ✎ Edit
          </button>
          <button
            className="nb-btn nb-btn-move"
            onClick={(e) => { e.stopPropagation(); onMoveUp?.() }}
            disabled={!onMoveUp}
            title="Move cell up"
          >
            ▲
          </button>
          <button
            className="nb-btn nb-btn-move"
            onClick={(e) => { e.stopPropagation(); onMoveDown?.() }}
            disabled={!onMoveDown}
            title="Move cell down"
          >
            ▼
          </button>
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
        <div
          className="nb-md-rendered"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(cell.source) }}
        />
      </div>
    </div>
  )
}
