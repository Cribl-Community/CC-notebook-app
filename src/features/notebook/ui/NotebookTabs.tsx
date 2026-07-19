import { IconButton } from '@capra/core'
import { CloseOutlined, Plus } from '@capra/icons'

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
            <IconButton
              icon={CloseOutlined}
              size="xs"
              variant="tertiary"
              appearance="neutral"
              aria-label={`Close ${tab.title || 'Untitled'}`}
              onClick={(e) => {
                e.stopPropagation()
                onCloseTab(tab.id)
              }}
            />
          </div>
        )
      })}
      <IconButton
        icon={Plus}
        size="sm"
        variant="tertiary"
        appearance="neutral"
        aria-label="New notebook tab"
        onClick={onNewTab}
      />
    </div>
  )
}
