import { useRef } from 'react'
import type { KernelStatus } from './types'

interface ToolbarProps {
  kernelStatus: KernelStatus
  title: string
  onTitleChange: (title: string) => void
  onDownload: () => void
  onImportFile: (file: File) => void
  onAddCodeCell: () => void
  onAddMarkdownCell: () => void
  onRunAll: () => void
  onRestart: () => void
  theme: 'dark' | 'light'
  onThemeChange: (t: 'dark' | 'light') => void
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
  kernelStatus,
  title,
  onTitleChange,
  onDownload,
  onImportFile,
  onAddCodeCell,
  onAddMarkdownCell,
  onRunAll,
  onRestart,
  theme,
  onThemeChange,
}: ToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const busy = kernelStatus === 'busy' || kernelStatus === 'loading'

  return (
    <div className="nb-toolbar">
      <input
        type="text"
        className="nb-toolbar-title-input"
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        spellCheck={false}
        aria-label="Notebook title"
        title="Notebook title"
      />
      <div className="nb-toolbar-actions">
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
        <button className="nb-btn" onClick={onRunAll} disabled={busy} title="Run all code cells">
          ▶▶ Run All
        </button>
        <button className="nb-btn" onClick={onRestart} title="Restart kernel and clear outputs">
          ↺ Restart
        </button>
        <div className="nb-toolbar-divider" />
        <select
          className="nb-theme-select"
          value={theme}
          onChange={(e) => onThemeChange(e.target.value as 'dark' | 'light')}
          title="Select theme"
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
      <KernelIndicator status={kernelStatus} />
    </div>
  )
}
