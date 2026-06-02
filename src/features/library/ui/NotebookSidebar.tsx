import { useCallback, useMemo, useState } from 'react'
import {
  buildTreeRows,
  filterManifestItemsByTagSelection,
  type TreeRow,
} from '@features/library/manifest'
import type { ManifestItem } from '@features/library/manifest'
import { useEnv } from '@app/providers'
import { TagMultiFilter } from '@ui/TagMultiFilter'
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
  /** Creates a folder under the given parent (`null` = root). */
  onNewFolder: (parentId: string | null) => void
  onRename: (id: string, currentName: string) => void
  onStartMove: (id: string) => void
  onCancelMove: () => void
  onConfirmMove: (itemId: string, newParentId: string | null) => void
  onDelete: (id: string, name: string, kind: 'folder' | 'notebook') => void
  moveDestinations: { id: string | null; label: string }[]
  /** Opens tag editor (prompt) for a saved notebook. */
  onEditNotebookTags?: (id: string, currentTags: string[]) => void
}

function formatModified(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const diff = Date.now() - d.getTime()
  if (diff < 60_000) return 'now'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3600_000)}h ago`
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Folder path from root to `folderId` (exclusive of root). */
function folderSegmentsTo(
  items: ManifestItem[],
  folderId: string | null,
): { id: string; name: string }[] {
  if (folderId === null) return []
  const map = new Map(items.map((i) => [i.id, i]))
  const segments: { id: string; name: string }[] = []
  let id: string | null = folderId
  while (id) {
    const it = map.get(id)
    if (!it || it.type !== 'folder') break
    segments.unshift({ id: it.id, name: it.name })
    id = it.parentId
  }
  return segments
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
  onEditNotebookTags,
}: NotebookSidebarProps) {
  const { isKvMock } = useEnv()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [selectedFilterTags, setSelectedFilterTags] = useState<string[]>([])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    for (const it of items) {
      if (it.type !== 'notebook') continue
      for (const t of it.tags) s.add(t)
    }
    return [...s].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
  }, [items])

  const allTagSet = useMemo(() => new Set(allTags), [allTags])
  const effectiveFilterTags = useMemo(
    () => selectedFilterTags.filter((t) => allTagSet.has(t)),
    [selectedFilterTags, allTagSet],
  )

  const treeItems = useMemo(
    () => filterManifestItemsByTagSelection(items, new Set(effectiveFilterTags)),
    [items, effectiveFilterTags],
  )

  const rows: TreeRow[] = useMemo(() => buildTreeRows(treeItems), [treeItems])

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

  const toggleFilterTag = useCallback((tag: string) => {
    setSelectedFilterTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }, [])

  const breadcrumbFolderId = useMemo(() => {
    if (selectedNotebookId) {
      const nb = items.find((i) => i.id === selectedNotebookId && i.type === 'notebook')
      return nb?.parentId ?? null
    }
    return selectedParentId
  }, [items, selectedNotebookId, selectedParentId])

  const breadcrumbSegments = useMemo(
    () => folderSegmentsTo(items, breadcrumbFolderId),
    [items, breadcrumbFolderId],
  )

  const showTableHead = items.length > 0

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
      {isKvMock && (
        <div className="nb-sidebar-hint" title="KV store is simulated in this environment">
          Dev: local mock KV
        </div>
      )}
      {error && <div className="nb-sidebar-error">{error}</div>}
      <div className="nb-sidebar-toolbar">
        <button
          type="button"
          className="nb-btn nb-btn-primary nb-btn-sidebar-primary"
          onClick={onNewNotebook}
        >
          + New notebook
        </button>
        <div className="nb-sidebar-toolbar-row">
          <button
            type="button"
            className="nb-btn nb-btn-sidebar"
            onClick={() => onNewFolder(selectedParentId)}
          >
            New folder
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
            Root
          </button>
        </div>
      </div>
      <nav className="nb-sidebar-breadcrumb" aria-label="Current folder">
        <button
          type="button"
          className="nb-sidebar-crumb nb-sidebar-crumb--root"
          onClick={() => onSelectParent(null)}
          title="Root"
        >
          /
        </button>
        {breadcrumbSegments.map((seg) => (
          <span key={seg.id} className="nb-sidebar-crumb-wrap">
            <span className="nb-sidebar-crumb-sep" aria-hidden>
              /
            </span>
            <button
              type="button"
              className="nb-sidebar-crumb"
              onClick={() => onSelectParent(seg.id)}
              title={seg.name}
            >
              {seg.name}
            </button>
          </span>
        ))}
      </nav>
      <TagMultiFilter
        summary="Filter by tag"
        hint="Shows notebooks that have any selected tag."
        allTags={allTags}
        selected={effectiveFilterTags}
        onToggle={toggleFilterTag}
        onClear={() => setSelectedFilterTags([])}
      />
      <p className="nb-sidebar-help">Select a folder for new saves; click a notebook to open it.</p>
      {showTableHead && (
        <div className="nb-sidebar-table-head" aria-hidden>
          <span className="nb-sidebar-table-head-name">Name</span>
          <span className="nb-sidebar-table-head-modified">Modified</span>
          <span className="nb-sidebar-table-head-actions" />
        </div>
      )}
      <div className="nb-sidebar-tree" role="tree">
        {loading && items.length === 0 && (
          <div className="nb-sidebar-empty">Loading…</div>
        )}
        {!loading && visibleRows.length === 0 && (
          <div className="nb-sidebar-empty">
            {items.length === 0
              ? 'No saved notebooks yet.'
              : effectiveFilterTags.length > 0
                ? 'No notebooks match this tag filter.'
                : 'No saved notebooks yet.'}
          </div>
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
              <span className="nb-sidebar-row-modified">{formatModified(item.updatedAt)}</span>
              <span className="nb-sidebar-row-actions">
                {item.type === 'folder' && (
                  <button
                    type="button"
                    className="nb-sidebar-mini"
                    title="New folder inside"
                    aria-label="New folder inside"
                    onClick={(e) => {
                      e.stopPropagation()
                      onNewFolder(item.id)
                    }}
                  >
                    +
                  </button>
                )}
                {item.type === 'notebook' && onEditNotebookTags && (
                  <button
                    type="button"
                    className="nb-sidebar-mini"
                    title="Edit tags"
                    aria-label="Edit tags"
                    onClick={(e) => {
                      e.stopPropagation()
                      onEditNotebookTags(item.id, item.tags)
                    }}
                  >
                    ⌗
                  </button>
                )}
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
