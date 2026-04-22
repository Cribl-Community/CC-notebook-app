export interface NotebookTabLabel {
  id: string
  title: string
  dirty: boolean
}

interface NotebookTabsProps {
  tabs: NotebookTabLabel[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
}

export function NotebookTabs({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }: NotebookTabsProps) {
  return (
    <div className="nb-tab-bar" role="tablist" aria-label="Open notebooks">
      {tabs.map((tab) => {
        const active = tab.id === activeTabId
        return (
          <div
            key={tab.id}
            role="tab"
            aria-selected={active}
            className={`nb-tab${active ? ' nb-tab--active' : ''}`}
          >
            <button
              type="button"
              className="nb-tab-select"
              onClick={() => onSelectTab(tab.id)}
              title={tab.title}
            >
              <span className="nb-tab-title">{tab.title || 'Untitled'}</span>
              {tab.dirty && <span className="nb-tab-dirty" aria-hidden />}
            </button>
            <button
              type="button"
              className="nb-tab-close"
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
              aria-label={`Close ${tab.title || 'Untitled'}`}
              title="Close tab"
            >
              ×
            </button>
          </div>
        )
      })}
      <button type="button" className="nb-tab-new" onClick={onNewTab} title="New notebook tab">
        +
      </button>
    </div>
  )
}
