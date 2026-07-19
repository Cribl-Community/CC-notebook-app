import { Button, Modal, Spinner } from '@capra/core'
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
  const loading = notebooks === null && !error

  return (
    <Modal
      isOpen={open}
      title="Import from Cribl Search"
      size="md"
      footer={
        <Modal.FooterActions>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
        </Modal.FooterActions>
      }
      onClose={onClose}
    >
      <p className="nb-dialog-message nb-dialog-message--muted">
        Select a saved Cribl Search Notebook. Search cells become <code>%%cribl_search</code> cells; notes
        become markdown.
      </p>
      {loading && (
        <p className="nb-cribl-nb-picker-status">
          <Spinner size="sm" title="Loading notebooks" /> Loading notebooks…
        </p>
      )}
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
                  <span className="nb-cribl-nb-picker-meta">{new Date(nb.updatedAt).toLocaleString()}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
