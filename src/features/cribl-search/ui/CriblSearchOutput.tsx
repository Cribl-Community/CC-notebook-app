import { useMemo, useState } from 'react'
import type { CriblSearchPayload } from '@platform/pyodide/types'

function formatCellTime(row: Record<string, unknown>): string {
  const v = row._time ?? row.time
  if (v == null) return '—'
  if (typeof v === 'number' && Number.isFinite(v)) {
    const n = v
    if (n > 1e15) return new Date(n / 1e6).toISOString()
    if (n > 1e12) return new Date(n).toISOString()
    if (n > 1e9 && n < 1e12) return new Date(n * 1000).toISOString()
    if (n > 1e6 && n < 1e9) return new Date(n * 1000).toISOString()
    return String(n)
  }
  return String(v)
}

function formatCellEvent(row: Record<string, unknown>): string {
  const raw = row._raw
  if (typeof raw === 'string') return raw.replace(/\s+/g, ' ').trim() || '(empty)'
  if (raw != null && typeof raw !== 'object') return String(raw)
  const parts: string[] = []
  for (const [k, v] of Object.entries(row)) {
    if (k === '_time' || k === 'time') continue
    if (v != null && typeof v !== 'object') parts.push(`${k}=${String(v)}`)
  }
  return parts.length > 0 ? parts.join(' ') : JSON.stringify(row)
}

function typeLabel(v: unknown): string {
  if (v === null || v === undefined) return '∅'
  const t = typeof v
  if (t === 'number') return Number.isInteger(v) ? '#' : 'f'
  if (t === 'boolean') return 'b'
  if (t === 'object') return '{ }'
  return 'a'
}

type CriblSearchOutputProps = { payload: CriblSearchPayload }

export function CriblSearchOutputView({ payload }: CriblSearchOutputProps) {
  if (payload.kind === 'running') {
    const pct = Math.round(payload.progress * 100)
    return (
      <div className="nb-cribl-root">
        <div className="nb-cribl-progress-wrap" aria-label={payload.label}>
          <div className="nb-cribl-progress-track">
            <div className="nb-cribl-progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span className="nb-cribl-progress-label">{payload.label}</span>
        </div>
      </div>
    )
  }

  if (payload.kind === 'failed') {
    return (
      <div className="nb-cribl-root">
        <div className="nb-cribl-status nb-cribl-status--failed" role="status">
          <span className="nb-cribl-status-icon" aria-hidden>
            ✗
          </span>
          <span className="nb-cribl-status-word">failed</span>
        </div>
        <pre className="nb-output-pre nb-cribl-fail-msg">{payload.message}</pre>
      </div>
    )
  }

  const { columns, rows, recordsReturned, totalRecords, showTable } = payload
  const dataframeVar = payload.dataframeVar ?? 'results_df'
  const showTableUi = showTable !== false
  const summary =
    totalRecords != null && totalRecords !== recordsReturned
      ? `${recordsReturned} records returned (${totalRecords} total matching)`
      : `${recordsReturned} records returned`

  return (
    <div className="nb-cribl-root">
      <div className="nb-cribl-status nb-cribl-status--ok" role="status">
        <span className="nb-cribl-status-icon" aria-hidden>
          ✓
        </span>
        <span className="nb-cribl-status-word">completed</span>
      </div>
      <div className="nb-cribl-meta">
        <div className="nb-cribl-meta-line">{summary}</div>
        <div className="nb-cribl-meta-line">
          <span className="nb-cribl-meta-k">DataFrame</span>
          <span className="nb-cribl-meta-v">
            Results saved in <code className="nb-cribl-df-var">{dataframeVar}</code>
          </span>
        </div>
        <div className="nb-cribl-meta-line">
          <span className="nb-cribl-meta-k">Columns</span>
          <span className="nb-cribl-meta-v">{columns.length > 0 ? columns.join(', ') : '—'}</span>
        </div>
        {!showTableUi && (
          <div className="nb-cribl-meta-line nb-cribl-meta-line--dim">Result table hidden (preview=false).</div>
        )}
        {showTableUi && recordsReturned > 0 && (
          <div className="nb-cribl-meta-line nb-cribl-meta-line--dim">
            {rows.length < recordsReturned
              ? `Table preview: showing ${rows.length} of ${recordsReturned} rows (full result is in ${dataframeVar}).`
              : rows.length === 1
                ? 'Table preview: 1 row.'
                : `Table preview: all ${rows.length} rows.`}
          </div>
        )}
      </div>
      {showTableUi && <CriblSearchResultsBody rows={rows} />}
    </div>
  )
}

function CriblSearchResultsBody({ rows }: { rows: Record<string, unknown>[] }) {
  const [expanded, setExpanded] = useState<number | null>(null)

  return (
    <div className="nb-cribl-table-outer">
      <div className="nb-cribl-table-wrap">
        <table className="nb-cribl-table">
          <thead>
            <tr>
              <th className="nb-cribl-col-expand" aria-label="expand" />
              <th className="nb-cribl-col-time">Time</th>
              <th className="nb-cribl-col-event">Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const open = expanded === i
              return (
                <SearchResultRow
                  key={i}
                  row={row}
                  index={i}
                  open={open}
                  onToggle={() => setExpanded(open ? null : i)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SearchResultRow({
  row,
  index,
  open,
  onToggle,
}: {
  row: Record<string, unknown>
  index: number
  open: boolean
  onToggle: () => void
}) {
  const keys = useMemo(() => Object.keys(row).sort((a, b) => a.localeCompare(b)), [row])
  return (
    <>
      <tr
        className={`nb-cribl-tr${index % 2 === 1 ? ' nb-cribl-tr--alt' : ''}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onToggle()
          }
        }}
      >
        <td className="nb-cribl-col-expand">
          <span className="nb-cribl-expand-icon" aria-hidden>
            {open ? '▼' : '▶'}
          </span>
        </td>
        <td className="nb-cribl-col-time">{formatCellTime(row)}</td>
        <td className="nb-cribl-col-event">
          <span className="nb-cribl-event-one-line">{formatCellEvent(row)}</span>
        </td>
      </tr>
      {open && (
        <tr className={`nb-cribl-detail-tr${index % 2 === 1 ? ' nb-cribl-tr--alt' : ''}`}>
          <td colSpan={3} className="nb-cribl-detail-cell">
            <div className="nb-cribl-detail-head">
              <span className="nb-cribl-detail-time">{formatCellTime(row)}</span>
            </div>
            <dl className="nb-cribl-dl">
              {keys.map((k) => (
                <div key={k} className="nb-cribl-dl-row">
                  <dt className="nb-cribl-dl-k">
                    <span className="nb-cribl-type-tag">{typeLabel(row[k])}</span>
                    {k}
                  </dt>
                  <dd className="nb-cribl-dl-v">{formatDetailValue(row[k])}</dd>
                </div>
              ))}
            </dl>
          </td>
        </tr>
      )}
    </>
  )
}

function formatDetailValue(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
