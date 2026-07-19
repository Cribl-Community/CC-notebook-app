import { useRef } from 'react'
import { Switch } from '@capra/core'
import type { CapraThemeMode } from '@app/providers'
import type { KernelStatus } from '@features/notebook/model/types'

interface ToolbarProps {
  /** Welcome tab: theme toggle only; notebook actions hidden. */
  variant?: 'notebook' | 'welcome'
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
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = kernelStatus === 'busy' || kernelStatus === 'loading'
  const welcome = variant === 'welcome'

  return (
    <div className={`nb-toolbar${welcome ? ' nb-toolbar--welcome' : ''}`}>
      <input
        type="text"
        className="nb-toolbar-title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        spellCheck={false}
        readOnly={welcome}
        aria-label="Notebook title"
        title="Notebook title"
      />
      {!welcome && dirty && (
        <span className="nb-toolbar-dirty" title="Unsaved changes">
          ●
        </span>
      )}
      <div className="nb-toolbar-actions">
        {!welcome && (
          <>
            <button
              className="nb-btn nb-btn-primary"
              type="button"
              onClick={onSave}
              disabled={saveDisabled}
              title="Save notebook to Cribl storage"
            >
              Save
            </button>
            <button className="nb-btn" type="button" onClick={onDownload} title="Download as .ipynb">
              ⬇ Download
            </button>
            <button
              className="nb-btn"
              type="button"
              onClick={() => fileRef.current?.click()}
              title="Open a Jupyter notebook file"
            >
              ⬆ Upload
            </button>
            {onImportFromCriblSearch && (
              <button
                className="nb-btn"
                type="button"
                onClick={onImportFromCriblSearch}
                title="Import a saved Cribl Search Notebook"
              >
                ↓ From Cribl Search
              </button>
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
            <button className="nb-btn" onClick={onAddCodeCell} title="Add code cell at end">
              + Code
            </button>
            <button className="nb-btn nb-btn-md" onClick={onAddMarkdownCell} title="Add markdown cell at end">
              + Markdown
            </button>
            <div className="nb-toolbar-divider" />
            <button
              className="nb-btn nb-btn-stop"
              type="button"
              onClick={onStop}
              disabled={!stopEnabled}
              title="Stop running execution (pending cells cleared; Python interrupted when supported)"
            >
              ⏹ Stop
            </button>
            <button className="nb-btn" onClick={onRunAll} disabled={busy} title="Run all code cells">
              ▶▶ Run All
            </button>
            <button
              className="nb-btn"
              type="button"
              onClick={onClearAllOutputs}
              disabled={busy}
              title="Clear outputs from all code cells"
            >
              ⊗ Clear outputs
            </button>
            <button className="nb-btn" onClick={onRestart} title="Restart kernel and clear outputs">
              ↺ Restart
            </button>
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
            title="Toggle Capra dark mode"
          />
        </label>
      </div>
      {!welcome && <KernelIndicator status={kernelStatus} />}
    </div>
  )
}
