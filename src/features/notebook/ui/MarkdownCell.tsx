import { useRef, useEffect, useCallback } from 'react'
import type { MarkdownCell as MarkdownCellData } from '@features/notebook/model/types'
import { markdownImageTooLargeUserMessage, readImageFileAsDataUrl } from '@features/notebook/markdownEmbeds'
import { renderNotebookMarkdownToSafeHtml } from '@features/notebook/notebookMarkdownHtml'

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
  /** Shown when paste/insert image exceeds size limits or read fails. */
  onMarkdownEmbedError?: (message: string) => void
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
  onMarkdownEmbedError,
}: MarkdownCellProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const insertAtCursor = useCallback(
    (ta: HTMLTextAreaElement, insert: string) => {
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const next = cell.source.slice(0, start) + insert + cell.source.slice(end)
      onChange(next)
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + insert.length
        ta.setSelectionRange(pos, pos)
      })
    },
    [cell.source, onChange],
  )

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const dt = e.clipboardData
      if (!dt) return

      let file: File | null = null
      if (dt.items) {
        for (let i = 0; i < dt.items.length; i++) {
          const it = dt.items[i]
          if (it.kind === 'file' && it.type.startsWith('image/')) {
            file = it.getAsFile()
            if (file) break
          }
        }
      }
      if (!file && dt.files?.length) {
        file = [...dt.files].find((f) => f.type.startsWith('image/')) ?? null
      }
      if (!file) return

      e.preventDefault()
      const ta = e.currentTarget
      try {
        const dataUrl = await readImageFileAsDataUrl(file)
        if (!dataUrl) {
          onMarkdownEmbedError?.(markdownImageTooLargeUserMessage())
          return
        }
        insertAtCursor(ta, `\n\n![image](${dataUrl})\n\n`)
      } catch {
        onMarkdownEmbedError?.('Could not paste image into markdown.')
      }
    },
    [insertAtCursor, onMarkdownEmbedError],
  )

  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      const ta = textareaRef.current
      if (!ta) return
      try {
        const dataUrl = await readImageFileAsDataUrl(file)
        if (!dataUrl) {
          onMarkdownEmbedError?.(markdownImageTooLargeUserMessage())
          return
        }
        insertAtCursor(ta, `\n\n![image](${dataUrl})\n\n`)
      } catch {
        onMarkdownEmbedError?.('Could not insert image.')
      }
    },
    [insertAtCursor, onMarkdownEmbedError],
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
              type="button"
              className="nb-btn"
              onClick={(e) => {
                e.stopPropagation()
                handlePickImage()
              }}
              title="Insert image from file (max 512 KB)"
            >
              Image
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="nb-hidden-file-input"
              aria-hidden
              tabIndex={-1}
              onChange={handleImageFileChange}
            />
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
            onPaste={handlePaste}
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
          dangerouslySetInnerHTML={{ __html: renderNotebookMarkdownToSafeHtml(cell.source) }}
        />
      </div>
    </div>
  )
}
