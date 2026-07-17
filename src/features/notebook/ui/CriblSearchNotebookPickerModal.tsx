import { useEffect, useId } from 'react'
import type { CriblSearchNotebookMeta } from '@/domain/criblSearchNotebook'

export type CriblSearchNotebookPickerModalProps = {
  open: boolean
  notebooks: CriblSearchNotebookMeta[] | null
  error: string | null
  onClose: () => void
  onSelect: (notebookId: string) => void
}

/** Modal to pick a Cribl Search Notebook for import into this app. */
export function CriblSearchNotebookPickerModal({
  open,
  notebooks,
  error,
  onClose,
  onSelect,
}: CriblSearchNotebookPickerModalProps) {
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const loading = notebooks === null && !error

  return (
    <div
      className="nb-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="nb-dialog-panel nb-cribl-nb-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h2 id={titleId} className="nb-dialog-title">
          Import from Cribl Search
        </h2>
        <p className="nb-dialog-message nb-dialog-message--muted">
          Select a saved Cribl Search Notebook. Search cells become <code>%%cribl_search</code> cells; notes
          become markdown.
        </p>
        {loading && <p className="nb-cribl-nb-picker-status">Loading notebooks…</p>}
        {error && <p className="nb-cribl-nb-picker-error">{error}</p>}
        {!loading && !error && notebooks && notebooks.length === 0 && (
          <p className="nb-cribl-nb-picker-status">No Cribl Search Notebooks found.</p>
        )}
        {!loading && !error && notebooks && notebooks.length > 0 && (
          <ul className="nb-cribl-nb-picker-list">
            {notebooks.map((nb) => (
              <li key={nb.id}>
                <button type="button" className="nb-cribl-nb-picker-row" onClick={() => onSelect(nb.id)}>
                  <span className="nb-cribl-nb-picker-name">{nb.name}</span>
                  {nb.updatedAt != null && (
                    <span className="nb-cribl-nb-picker-meta">
                      {new Date(nb.updatedAt).toLocaleString()}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="nb-dialog-actions">
          <button type="button" className="nb-btn nb-dialog-btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
