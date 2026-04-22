import type { Cell, CellId, NotebookAction } from '@features/notebook/model/types'
import { CodeCell } from '@features/notebook/ui/CodeCell'
import { MarkdownCell } from '@features/notebook/ui/MarkdownCell'
import type { CompletionItem } from '@platform/pyodide/types'

interface CellListProps {
  cells: Cell[]
  selectedId: CellId | null
  dispatch: React.Dispatch<NotebookAction>
  /** Run and move selection down / insert cell below last (Shift+Enter, ▶). `runAll` uses the same queue without UI advance. */
  onRunAndAdvance: (id: CellId, cellIndex: number) => void
  codeMirrorLuma: 'light' | 'dark'
  completeCode?: (code: string, cursor: number) => Promise<CompletionItem[] | null>
  onAiGenerateFromPrompt?: (id: CellId, prompt: string) => void
  aiCodeBusyCellId?: CellId | null
}

export function CellList({
  cells,
  selectedId,
  dispatch,
  onRunAndAdvance,
  codeMirrorLuma,
  completeCode,
  onAiGenerateFromPrompt,
  aiCodeBusyCellId,
}: CellListProps) {
  return (
    <div className="nb-cell-list">
      {cells.map((cell, index) => (
        <div key={cell.id}>
          {cell.cell_type === 'code' ? (
            <CodeCell
              cell={cell}
              isSelected={cell.id === selectedId}
              codeMirrorLuma={codeMirrorLuma}
              completeCode={completeCode}
              onSelect={() => dispatch({ type: 'SELECT_CELL', id: cell.id })}
              onRun={() => onRunAndAdvance(cell.id, index)}
              onDelete={() => dispatch({ type: 'DELETE_CELL', id: cell.id })}
              onChange={(source) => dispatch({ type: 'UPDATE_SOURCE', id: cell.id, source })}
              onClearOutput={() => dispatch({ type: 'CLEAR_OUTPUTS', id: cell.id })}
              onMoveUp={index > 0 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'up' }) : undefined}
              onMoveDown={index < cells.length - 1 ? () => dispatch({ type: 'MOVE_CELL', id: cell.id, direction: 'down' }) : undefined}
              onClone={() => dispatch({ type: 'DUPLICATE_CELL', id: cell.id })}
              onAiGenerateFromPrompt={
                onAiGenerateFromPrompt ? (p) => onAiGenerateFromPrompt(cell.id, p) : undefined
              }
              aiGenerateBusy={aiCodeBusyCellId === cell.id}
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
              onClone={() => dispatch({ type: 'DUPLICATE_CELL', id: cell.id })}
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
