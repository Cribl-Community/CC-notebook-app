import { useRef } from 'react'
import { Button, Switch } from '@capra/core'
import type { CapraThemeMode } from '@app/providers'
import type { KernelStatus } from '@features/notebook/model/types'

interface ToolbarProps {
  /** Welcome/chat tabs: theme toggle only; notebook actions hidden. */
  variant?: 'notebook' | 'welcome' | 'chat'
  kernelStatus: KernelStatus
  title: string
  onTitleChange: (title: string) => void
  onDownload: () => void
  onImportFile: (file: File) => void
  onImportFromCriblSearch?: () => void
  onSave: () => void
  saveDisabled?: boolean
  dirty?: boolean
  onAddCodeCell: () => void
  onAddMarkdownCell: () => void
  onRunAll: () => void
  onClearAllOutputs: () => void
  onStop: () => void
  stopEnabled: boolean
  onRestart: () => void
  themeMode: CapraThemeMode
  onThemeModeChange: (mode: CapraThemeMode) => void
  /** When set, shows a control to show/hide the left Notebooks / AI Chat panel. */
  leftPanelOpen?: boolean
  onToggleLeftPanel?: () => void
}

function KernelIndicator({ status }: { status: KernelStatus }) {
  const dotClass =
    status === 'ready'
      ? 'nb-kernel-dot nb-kernel-dot--ready'
      : status === 'busy'
        ? 'nb-kernel-dot nb-kernel-dot--busy'
        : status === 'error'
          ? 'nb-kernel-dot nb-kernel-dot--error'
          : 'nb-kernel-dot nb-kernel-dot--loading'
  const label =
    status === 'ready'
      ? 'Ready'
      : status === 'busy'
        ? 'Busy'
        : status === 'error'
          ? 'Error'
          : 'Loading…'
  return (
    <span className="nb-kernel-status">
      <span className={dotClass}>●</span>
      <span>{label}</span>
    </span>
  )
}

export function Toolbar({
  variant = 'notebook',
  kernelStatus,
  title,
  onTitleChange,
  onDownload,
  onImportFile,
  onImportFromCriblSearch,
  onSave,
  saveDisabled = false,
  dirty = false,
  onAddCodeCell,
  onAddMarkdownCell,
  onRunAll,
  onClearAllOutputs,
  onStop,
  stopEnabled,
  onRestart,
  themeMode,
  onThemeModeChange,
  leftPanelOpen,
  onToggleLeftPanel,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = kernelStatus === 'busy' || kernelStatus === 'loading'
  const chromeOnly = variant === 'welcome' || variant === 'chat'

  return (
    <div className={`nb-toolbar${chromeOnly ? ' nb-toolbar--welcome' : ''}`}>
      {onToggleLeftPanel && (
        <Button
          variant="secondary"
          size="sm"
          onClick={onToggleLeftPanel}
          aria-pressed={leftPanelOpen}
          aria-label={leftPanelOpen ? 'Hide left panel' : 'Show left panel'}
        >
          {leftPanelOpen ? 'Hide panel' : 'Show panel'}
        </Button>
      )}
      <input
        type="text"
        className="nb-toolbar-title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        spellCheck={false}
        readOnly={chromeOnly}
        aria-label="Notebook title"
        title="Notebook title"
      />
      {!chromeOnly && dirty && (
        <span className="nb-toolbar-dirty" title="Unsaved changes">
          ●
        </span>
      )}
      <div className="nb-toolbar-actions">
        {!chromeOnly && (
          <>
            <Button variant="primary" size="sm" onClick={onSave} disabled={saveDisabled}>
              Save
            </Button>
            <Button variant="secondary" size="sm" onClick={onDownload}>
              Download
            </Button>
            <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Upload
            </Button>
            {onImportFromCriblSearch && (
              <Button variant="secondary" size="sm" onClick={onImportFromCriblSearch}>
                From Cribl Search
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              className="nb-toolbar-file-input"
              accept=".ipynb,application/json,.json"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) onImportFile(f)
                e.target.value = ''
              }}
            />
            <div className="nb-toolbar-divider" />
            <Button variant="secondary" size="sm" onClick={onAddCodeCell}>
              Code
            </Button>
            <Button variant="secondary" size="sm" onClick={onAddMarkdownCell}>
              Markdown
            </Button>
            <div className="nb-toolbar-divider" />
            <Button
              variant="secondary"
              appearance="danger"
              size="sm"
              onClick={onStop}
              disabled={!stopEnabled}
            >
              Stop
            </Button>
            <Button variant="secondary" size="sm" onClick={onRunAll} disabled={busy}>
              Run All
            </Button>
            <Button variant="secondary" size="sm" onClick={onClearAllOutputs} disabled={busy}>
              Clear outputs
            </Button>
            <Button variant="secondary" size="sm" onClick={onRestart}>
              Restart
            </Button>
            <div className="nb-toolbar-divider" />
          </>
        )}
        <label className="nb-theme-toggle">
          <span className="nb-theme-toggle-label">Dark</span>
          <Switch
            size="sm"
            checked={themeMode === 'dark'}
            onChange={(e) => onThemeModeChange(e.target.checked ? 'dark' : 'light')}
            aria-label="Dark mode"
          />
        </label>
      </div>
      {!chromeOnly && <KernelIndicator status={kernelStatus} />}
    </div>
  )
}
