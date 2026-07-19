import type { ReactNode } from 'react'

export type LeftPanelMode = 'library' | 'chat'

export type WorkspaceLeftPanelProps = {
  mode: LeftPanelMode
  onModeChange: (mode: LeftPanelMode) => void
  library: ReactNode
  chat: ReactNode
}

/**
 * Left column: vertical mode tabs (Notebooks | AI Chat) + panel body.
 * Both panels stay mounted so AI Chat session state survives mode switches.
 */
export function WorkspaceLeftPanel({ mode, onModeChange, library, chat }: WorkspaceLeftPanelProps) {
  return (
    <div className="nb-left" data-testid="workspace-left-panel">
      <div className="nb-left-rail" role="tablist" aria-orientation="vertical" aria-label="Left panel">
        <button
          type="button"
          role="tab"
          id="nb-left-tab-library"
          aria-controls="nb-left-panel-library"
          aria-selected={mode === 'library'}
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
          className={'nb-left-rail-tab' + (mode === 'chat' ? ' nb-left-rail-tab--active' : '')}
          onClick={() => onModeChange('chat')}
        >
          AI Chat
        </button>
      </div>
      <div className="nb-left-body">
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
    </div>
  )
}
