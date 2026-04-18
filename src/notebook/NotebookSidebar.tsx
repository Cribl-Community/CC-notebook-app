import { useCallback, useMemo, useState } from 'react'
import { buildTreeRows, type TreeRow } from './manifest'
import type { ManifestItem } from './manifest'
import { isKvMockMode } from '../cribl/kvstore'

interface NotebookSidebarProps {
  items: ManifestItem[]
  loading: boolean
  error: string | null
  selectedNotebookId: string | null
  /** Folder chosen as parent for the next "Save" when no notebook is selected yet. */
  selectedParentId: string | null
  movingId: string | null
  onRefresh: () => void
  onSelectParent: (folderId: string | null) => void
  onOpenNotebook: (id: string) => void
  onNewNotebook: () => void
  onNewFolder: () => void
  onRename: (id: string, currentName: string) => void
  onStartMove: (id: string) => void
  onCancelMove: () => void
  onConfirmMove: (itemId: string, newParentId: string | null) => void
  onDelete: (id: string, name: string, kind: 'folder' | 'notebook') => void
  moveDestinations: { id: string | null; label: string }[]
}

export function NotebookSidebar({
  items,
  loading,
  error,
  selectedNotebookId,
  selectedParentId,
  movingId,
  onRefresh,
  onSelectParent,
  onOpenNotebook,
  onNewNotebook,
  onNewFolder,
  onRename,
  onStartMove,
  onCancelMove,
  onConfirmMove,
  onDelete,
  moveDestinations,
}: NotebookSidebarProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  const rows: TreeRow[] = useMemo(() => buildTreeRows(items), [items])

  const toggleFolder = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const visibleRows = useMemo(() => {
    if (rows.length === 0) return []
    const result: TreeRow[] = []
    let skipUntilDepth = -1
    for (const row of rows) {
      const { item, depth } = row
      if (skipUntilDepth >= 0 && depth > skipUntilDepth) continue
      skipUntilDepth = -1
      result.push(row)
      if (item.type === 'folder' && collapsed.has(item.id)) {
        skipUntilDepth = depth
      }
    }
    return result
  }, [rows, collapsed])

  const [moveTarget, setMoveTarget] = useState<string>('')

  const movingItem = movingId ? items.find((i) => i.id === movingId) : undefined

  return (
    <aside className="nb-sidebar" aria-label="Saved notebooks">
      <div className="nb-sidebar-header">
        <span className="nb-sidebar-title">Notebooks</span>
        <button
          type="button"
          className="nb-sidebar-icon-btn"
          onClick={() => onRefresh()}
          disabled={loading}
          title="Refresh list"
        >
          ↻
        </button>
      </div>
      {isKvMockMode() && (
        <div className="nb-sidebar-hint" title="KV store is simulated in this environment">
          Dev: local mock KV
        </div>
      )}
      {error && <div className="nb-sidebar-error">{error}</div>}
      <div className="nb-sidebar-actions">
        <button type="button" className="nb-btn nb-btn-sidebar" onClick={onNewNotebook}>
          + New
        </button>
        <button type="button" className="nb-btn nb-btn-sidebar" onClick={onNewFolder}>
          + Folder
        </button>
        <button
          type="button"
          className={
            'nb-btn nb-btn-sidebar' +
            (selectedNotebookId === null && selectedParentId === null ? ' nb-btn-sidebar--sel' : '')
          }
          onClick={() => onSelectParent(null)}
          title="Save new notebooks to the root"
        >
          📂 Root
        </button>
      </div>
      <p className="nb-sidebar-help">
        Click a folder to choose where new notebooks are saved. Click a notebook to open it.
      </p>
      <div className="nb-sidebar-tree" role="tree">
        {loading && items.length === 0 && (
          <div className="nb-sidebar-empty">Loading…</div>
        )}
        {!loading && visibleRows.length === 0 && (
          <div className="nb-sidebar-empty">No saved notebooks yet.</div>
        )}
        {visibleRows.map(({ item, depth }) => {
          const isNb = item.type === 'notebook'
          const isSelNb = isNb && selectedNotebookId === item.id
          const isSelFolder =
            !isNb && selectedNotebookId === null && selectedParentId === item.id
          const rowClass =
            'nb-sidebar-row' +
            (isNb ? ' nb-sidebar-row--notebook' : ' nb-sidebar-row--folder') +
            (isSelNb || isSelFolder ? ' nb-sidebar-row--selected' : '')

          return (
            <div
              key={item.id}
              role="treeitem"
              className={rowClass + (isSelNb ? ' nb-sidebar-row--active-nb' : '')}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => {
                if (item.type === 'folder') {
                  onSelectParent(item.id)
                } else {
                  onOpenNotebook(item.id)
                }
              }}
            >
              {item.type === 'folder' ? (
                <button
                  type="button"
                  className="nb-sidebar-chevron"
                  aria-label={collapsed.has(item.id) ? 'Expand' : 'Collapse'}
                  onClick={(e) => {
                    e.stopPropagation()
                    toggleFolder(item.id)
                  }}
                >
                  {collapsed.has(item.id) ? '▸' : '▾'}
                </button>
              ) : (
                <span className="nb-sidebar-chevron nb-sidebar-chevron--spacer" />
              )}
              <span className="nb-sidebar-row-label">
                {item.type === 'folder' ? '📁' : '📓'} {item.name}
              </span>
              <span className="nb-sidebar-row-actions">
                <button
                  type="button"
                  className="nb-sidebar-mini"
                  title="Rename"
                  onClick={(e) => {
                    e.stopPropagation()
                    onRename(item.id, item.name)
                  }}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="nb-sidebar-mini"
                  title="Move"
                  onClick={(e) => {
                    e.stopPropagation()
                    setMoveTarget(item.parentId ?? '')
                    onStartMove(item.id)
                  }}
                >
                  ➜
                </button>
                <button
                  type="button"
                  className="nb-sidebar-mini"
                  title="Delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDelete(item.id, item.name, item.type)
                  }}
                >
                  ✕
                </button>
              </span>
            </div>
          )
        })}
      </div>

      {movingItem && (
        <div className="nb-sidebar-move-panel">
          <div className="nb-sidebar-move-title">Move “{movingItem.name}”</div>
          <label className="nb-sidebar-move-label">
            Destination
            <select
              className="nb-sidebar-select"
              value={moveTarget}
              onChange={(e) => setMoveTarget(e.target.value)}
            >
              {moveDestinations.map((o) => (
                <option key={o.id ?? 'root'} value={o.id ?? ''}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <div className="nb-sidebar-move-actions">
            <button type="button" className="nb-btn" onClick={onCancelMove}>
              Cancel
            </button>
            <button
              type="button"
              className="nb-btn nb-btn-primary"
              onClick={() => {
                if (!movingId) return
                const dest = moveTarget === '' ? null : moveTarget
                onConfirmMove(movingId, dest)
              }}
            >
              Move here
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}
