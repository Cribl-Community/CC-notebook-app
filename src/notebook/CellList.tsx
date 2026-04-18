import type { Cell, CellId, NotebookAction } from './types'
import { CodeCell } from './CodeCell'
import { MarkdownCell } from './MarkdownCell'
import type { CompletionItem } from '../pyodide/types'

interface CellListProps {
  cells: Cell[]
  selectedId: CellId | null
  dispatch: React.Dispatch<NotebookAction>
  onRun: (id: CellId) => void
  theme: 'dark' | 'light'
  completeCode?: (code: string, cursor: number) => Promise<CompletionItem[] | null>
}

export function CellList({
  cells,
  selectedId,
  dispatch,
  onRun,
  theme,
  completeCode,
}: CellListProps) {
  return (
    <div className="nb-cell-list">
      {cells.map((cell, index) => (
        <div key={cell.id}>
          {cell.cell_type === 'code' ? (
            <CodeCell
              cell={cell}
              isSelected={cell.id === selectedId}
              theme={theme}
              completeCode={completeCode}
              onSelect={() => dispatch({ type: 'SELECT_CELL', id: cell.id })}
              onRun={() => onRun(cell.id)}
              onDelete={() => dispatch({ type: 'DELETE_CELL', id: cell.id })}
              onChange={(source) => dispatch({ type: 'UPDATE_SOURCE', id: cell.id, source })}
              onClearOutput={() => dispatch({ type: 'CLEAR_OUTPUTS', id: cell.id })}
              onMoveUp={index > 0 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'up' }) : undefined}
              onMoveDown={index < cells.length - 1 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'down' }) : undefined}
            />
          ) : (
            <MarkdownCell
              cell={cell}
              isSelected={cell.id === selectedId}
              onSelect={() => dispatch({ type: 'SELECT_CELL', id: cell.id })}
              onToggleEdit={() => dispatch({ type: 'TOGGLE_MARKDOWN_EDIT', id: cell.id })}
              onDelete={() => dispatch({ type: 'DELETE_CELL', id: cell.id })}
              onChange={(source) => dispatch({ type: 'UPDATE_SOURCE', id: cell.id, source })}
              onMoveUp={index > 0 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'up' }) : undefined}
              onMoveDown={index < cells.length - 1 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'down' }) : undefined}
            />
          )}
          <div className="nb-add-between">
            <button
              className="nb-add-between-btn"
              onClick={() => dispatch({ type: 'ADD_CELL', afterId: cell.id, cellType: 'code' })}
              title="Add code cell below"
            >
              + Code
            </button>
            <button
              className="nb-add-between-btn"
              onClick={() =>
                dispatch({ type: 'ADD_CELL', afterId: cell.id, cellType: 'markdown' })
              }
              title="Add markdown cell below"
            >
              + Markdown
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
