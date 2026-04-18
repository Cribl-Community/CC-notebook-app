import type { KernelStatus } from './types'

interface ToolbarProps {
  kernelStatus: KernelStatus
  onAddCodeCell: () => void
  onAddMarkdownCell: () => void
  onRunAll: () => void
  onRestart: () => void
}

function KernelIndicator({ status }: { status: KernelStatus }) {
  const color =
    status === 'ready'
      ? '#22c55e'
      : status === 'busy'
        ? '#f59e0b'
        : status === 'error'
          ? '#ef4444'
          : '#94a3b8'
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
      <span style={{ color, fontSize: 10, lineHeight: 1 }}>●</span>
      <span>{label}</span>
    </span>
  )
}

export function Toolbar({
  kernelStatus,
  onAddCodeCell,
  onAddMarkdownCell,
  onRunAll,
  onRestart,
}: ToolbarProps) {
  const busy = kernelStatus === 'busy' || kernelStatus === 'loading'
  return (
    <div className="nb-toolbar">
      <span className="nb-toolbar-title">Notebook</span>
      <div className="nb-toolbar-actions">
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
      </div>
      <KernelIndicator status={kernelStatus} />
    </div>
  )
}
