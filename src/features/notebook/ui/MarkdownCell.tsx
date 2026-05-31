import { useRef, useEffect, useCallback, useMemo } from 'react'
import type { MarkdownCell as MarkdownCellData } from '@features/notebook/model/types'
import {
  joinMarkdownDataImageEmbeds,
  markdownImageTooLargeUserMessage,
  mergeAdjacentMarkdownTextSegments,
  readImageFileAsDataUrl,
  splitMarkdownByDataImageEmbeds,
} from '@features/notebook/markdownEmbeds'
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
  const editStackRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const lastFocusedTextSegRef = useRef(0)
  const prevEditingRef = useRef(cell.editing)

  const editSegments = useMemo(() => splitMarkdownByDataImageEmbeds(cell.source), [cell.source])

  useEffect(() => {
    if (cell.editing && !prevEditingRef.current) {
      const segs = splitMarkdownByDataImageEmbeds(cell.source)
      const idx = segs.findIndex((s) => s.kind === 'text')
      lastFocusedTextSegRef.current = idx >= 0 ? idx : 0
      requestAnimationFrame(() => {
        const ta = editStackRef.current?.querySelector(
          'textarea.nb-md-edit-seg',
        ) as HTMLTextAreaElement | null
        ta?.focus()
      })
    }
    prevEditingRef.current = cell.editing
  }, [cell.editing, cell.source])

  // Auto-resize text segments in edit mode
  useEffect(() => {
    if (!cell.editing) return
    editStackRef.current?.querySelectorAll('textarea.nb-md-edit-seg').forEach((n) => {
      const ta = n as HTMLTextAreaElement
      ta.style.height = 'auto'
      ta.style.height = `${ta.scrollHeight}px`
    })
  }, [cell.editing, cell.source])

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

  const insertAtCursorInTextSegment = useCallback(
    (ta: HTMLTextAreaElement, segIndex: number, insert: string) => {
      const segs = splitMarkdownByDataImageEmbeds(cell.source)
      const seg = segs[segIndex]
      if (!seg || seg.kind !== 'text') return
      const start = ta.selectionStart
      const end = ta.selectionEnd
      const nextText = seg.text.slice(0, start) + insert + seg.text.slice(end)
      segs[segIndex] = { kind: 'text', text: nextText }
      onChange(joinMarkdownDataImageEmbeds(segs))
      requestAnimationFrame(() => {
        ta.focus()
        const pos = start + insert.length
        ta.setSelectionRange(pos, pos)
      })
    },
    [cell.source, onChange],
  )

  const handlePasteInTextSegment = useCallback(
    (segIndex: number) => async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
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
        insertAtCursorInTextSegment(ta, segIndex, `\n\n![image](${dataUrl})\n\n`)
      } catch {
        onMarkdownEmbedError?.('Could not paste image into markdown.')
      }
    },
    [insertAtCursorInTextSegment, onMarkdownEmbedError],
  )

  const handlePickImage = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ''
      if (!file) return
      try {
        const dataUrl = await readImageFileAsDataUrl(file)
        if (!dataUrl) {
          onMarkdownEmbedError?.(markdownImageTooLargeUserMessage())
          return
        }
        const insert = `\n\n![image](${dataUrl})\n\n`
        const segs = splitMarkdownByDataImageEmbeds(cell.source)
        let ti = lastFocusedTextSegRef.current
        if (ti < 0 || !segs[ti] || segs[ti].kind !== 'text') {
          const keys = [...segs.keys()].reverse()
          const found = keys.find((k) => segs[k].kind === 'text')
          ti = found ?? -1
        }
        if (ti < 0) {
          onChange(joinMarkdownDataImageEmbeds([{ kind: 'text', text: insert }]))
          return
        }
        const t = segs[ti] as { kind: 'text'; text: string }
        segs[ti] = { kind: 'text', text: t.text + insert }
        onChange(joinMarkdownDataImageEmbeds(segs))
      } catch {
        onMarkdownEmbedError?.('Could not insert image.')
      }
    },
    [cell.source, onChange, onMarkdownEmbedError],
  )

  const handleRemoveEmbed = useCallback(
    (embedIndex: number) => {
      const segs = splitMarkdownByDataImageEmbeds(cell.source)
      if (segs[embedIndex]?.kind !== 'embed') return
      segs.splice(embedIndex, 1)
      onChange(joinMarkdownDataImageEmbeds(mergeAdjacentMarkdownTextSegments(segs)))
    },
    [cell.source, onChange],
  )

  const handleTextSegmentChange = useCallback(
    (segIndex: number, text: string) => {
      const segs = splitMarkdownByDataImageEmbeds(cell.source)
      if (segs[segIndex]?.kind !== 'text') return
      segs[segIndex] = { kind: 'text', text }
      onChange(joinMarkdownDataImageEmbeds(segs))
    },
    [cell.source, onChange],
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
          <div
            ref={editStackRef}
            className="nb-md-edit-stack"
            onClick={(e) => e.stopPropagation()}
          >
            {editSegments.map((seg, i) =>
              seg.kind === 'text' ? (
                <textarea
                  key={`md-t-${cell.id}-${i}`}
                  className="nb-cell-editor nb-md-editor nb-md-edit-seg"
                  value={seg.text}
                  onChange={(e) => handleTextSegmentChange(i, e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePasteInTextSegment(i)}
                  onFocus={() => {
                    onSelect()
                    lastFocusedTextSegRef.current = i
                  }}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Write Markdown here… (Shift+Enter to render)"
                  spellCheck
                  rows={1}
                />
              ) : (
                <figure key={`md-e-${cell.id}-${i}`} className="nb-md-edit-embed">
                  <div className="nb-md-edit-embed-bar">
                    <span className="nb-md-edit-embed-label">Embedded image</span>
                    <button
                      type="button"
                      className="nb-btn nb-btn-delete nb-md-edit-embed-remove"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleRemoveEmbed(i)
                      }}
                      title="Remove image from cell"
                    >
                      Remove
                    </button>
                  </div>
                  <img
                    className="nb-md-edit-embed-img"
                    src={seg.dataUrl}
                    alt={seg.alt || 'Embedded markdown image'}
                  />
                </figure>
              ),
            )}
          </div>
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
