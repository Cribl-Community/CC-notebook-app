import { useRef } from 'react'
// eslint-disable-next-line no-restricted-imports -- style metadata re-exported from providers barrel
import { NOTEBOOK_STYLES, type AppStyleId } from '@app/providers'
import type { KernelStatus } from '@features/notebook/model/types'

interface ToolbarProps {
  /** Welcome tab: style only; notebook actions hidden. */
  variant?: 'notebook' | 'welcome'
  kernelStatus: KernelStatus
  title: string
  onTitleChange: (title: string) => void
  onDownload: () => void
  onImportFile: (file: File) => void
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
  appStyle: AppStyleId
  onAppStyleChange: (s: AppStyleId) => void
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
  appStyle,
  onAppStyleChange,
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
        <select
          className="nb-style-select"
          value={appStyle}
          onChange={(e) => onAppStyleChange(e.target.value as AppStyleId)}
          title="Notebook color style"
          aria-label="Notebook color style"
        >
          {NOTEBOOK_STYLES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {!welcome && <KernelIndicator status={kernelStatus} />}
    </div>
  )
}
