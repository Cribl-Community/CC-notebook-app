import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

export type LeftPanelMode = 'library' | 'chat'

export type WorkspaceLeftPanelProps = {
  mode: LeftPanelMode
  onModeChange: (mode: LeftPanelMode) => void
  open: boolean
  bodyWidth: number
  onResizePointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  library: ReactNode
  chat: ReactNode
}

/**
 * Left column: vertical mode tabs (Notebooks | AI Chat) + resizable panel body.
 * Both panels stay mounted so AI Chat session state survives mode switches and collapse.
 */
export function WorkspaceLeftPanel({
  mode,
  onModeChange,
  open,
  bodyWidth,
  onResizePointerDown,
  library,
  chat,
}: WorkspaceLeftPanelProps) {
  return (
    <div
      className={'nb-left' + (open ? '' : ' nb-left--collapsed')}
      data-testid="workspace-left-panel"
      data-open={open ? 'true' : 'false'}
      aria-hidden={!open}
      style={open ? { width: undefined } : undefined}
    >
      <div className="nb-left-rail" role="tablist" aria-orientation="vertical" aria-label="Left panel">
        <button
          type="button"
          role="tab"
          id="nb-left-tab-library"
          aria-controls="nb-left-panel-library"
          aria-selected={mode === 'library'}
          tabIndex={open ? 0 : -1}
          className={
            'nb-left-rail-tab' + (mode === 'library' ? ' nb-left-rail-tab--active' : '')
          }
          onClick={() => onModeChange('library')}
        >
          Notebooks
        </button>
        <button
          type="button"
          role="tab"
          id="nb-left-tab-chat"
          aria-controls="nb-left-panel-chat"
          aria-selected={mode === 'chat'}
          tabIndex={open ? 0 : -1}
          className={'nb-left-rail-tab' + (mode === 'chat' ? ' nb-left-rail-tab--active' : '')}
          onClick={() => onModeChange('chat')}
        >
          AI Chat
        </button>
      </div>
      <div className="nb-left-body" style={{ width: bodyWidth }}>
        <div
          id="nb-left-panel-library"
          role="tabpanel"
          aria-labelledby="nb-left-tab-library"
          hidden={mode !== 'library'}
          className="nb-left-panel"
        >
          {library}
        </div>
        <div
          id="nb-left-panel-chat"
          role="tabpanel"
          aria-labelledby="nb-left-tab-chat"
          hidden={mode !== 'chat'}
          className="nb-left-panel nb-left-panel--chat"
        >
          {chat}
        </div>
      </div>
      <div
        className="nb-left-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize left panel"
        aria-valuemin={180}
        aria-valuemax={520}
        aria-valuenow={bodyWidth}
        onPointerDown={onResizePointerDown}
      />
    </div>
  )
}
