import { useEffect, useRef, useState } from 'react'
import { PyodideKernel } from './pyodide/PyodideKernel'
import type { KernelResult } from './pyodide/types'

type CheckStatus = 'pending' | 'pass' | 'fail'

interface Check {
  label: string
  code: string
  expect: (result: KernelResult) => boolean
  status: CheckStatus
  detail: string
}

const CHECKS: Omit<Check, 'status' | 'detail'>[] = [
  {
    label: '1 + 1',
    code: '1 + 1',
    expect: (r) => 'value' in r && r.value === '2',
  },
  {
    label: 'sys.version',
    code: 'import sys; sys.version',
    expect: (r) => 'value' in r && r.value.length > 0,
  },
  {
    label: 'sum(range(10))',
    code: 'sum(range(10))',
    expect: (r) => 'value' in r && r.value === '45',
  },
]

function statusIcon(s: CheckStatus) {
  if (s === 'pass') return '✓'
  if (s === 'fail') return '✗'
  return '…'
}

function statusColor(s: CheckStatus): string {
  if (s === 'pass') return '#22c55e'
  if (s === 'fail') return '#ef4444'
  return '#94a3b8'
}

type Phase = 'loading' | 'running' | 'done' | 'error'

export default function PyodideSmokeTest() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [checks, setChecks] = useState<Check[]>(
    CHECKS.map((c) => ({ ...c, status: 'pending', detail: '' })),
  )
  const [loadMs, setLoadMs] = useState<number>(0)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const kernelRef = useRef<PyodideKernel | null>(null)

  useEffect(() => {
    const kernel = new PyodideKernel()
    kernelRef.current = kernel
    const t0 = Date.now()

    kernel.ready
      .then(async () => {
        setLoadMs(Date.now() - t0)
        setPhase('running')

        for (let i = 0; i < CHECKS.length; i++) {
          const check = CHECKS[i]
          const result = await kernel.execute(check.code)
          const passed = check.expect(result)
          const detail = 'value' in result ? result.value : result.error
          setChecks((prev) =>
            prev.map((c, idx) =>
              idx === i ? { ...c, status: passed ? 'pass' : 'fail', detail } : c,
            ),
          )
        }

        setPhase('done')
      })
      .catch((err: unknown) => {
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setPhase('error')
      })

    return () => {
      kernel.dispose()
    }
  }, [])

  const allPass = checks.every((c) => c.status === 'pass')

  return (
    <div
      style={{
        fontFamily: 'monospace',
        maxWidth: 540,
        margin: '48px auto',
        padding: '24px',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        background: '#0f172a',
        color: '#e2e8f0',
      }}
    >
      <div style={{ marginBottom: 16, fontSize: 13, color: '#94a3b8' }}>
        Pyodide Kernel Smoke Test
      </div>

      {phase === 'loading' && (
        <div style={{ color: '#94a3b8' }}>Loading Pyodide from CDN…</div>
      )}

      {phase === 'error' && (
        <div style={{ color: '#ef4444' }}>
          Kernel failed to load: {errorMsg}
        </div>
      )}

      {(phase === 'running' || phase === 'done') && (
        <>
          <div style={{ marginBottom: 12, fontSize: 12, color: '#64748b' }}>
            ready in {loadMs} ms · origin: {window.location.origin}
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {checks.map((c) => (
                <tr key={c.label} style={{ borderBottom: '1px solid #1e293b' }}>
                  <td style={{ padding: '6px 0', color: statusColor(c.status), width: 20 }}>
                    {statusIcon(c.status)}
                  </td>
                  <td style={{ padding: '6px 8px', color: '#cbd5e1' }}>{c.label}</td>
                  <td style={{ padding: '6px 0', color: '#64748b', textAlign: 'right' }}>
                    {c.detail}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {phase === 'done' && (
            <div
              style={{
                marginTop: 16,
                padding: '8px 12px',
                borderRadius: 4,
                background: allPass ? '#14532d' : '#450a0a',
                color: allPass ? '#86efac' : '#fca5a5',
                fontSize: 13,
              }}
            >
              {allPass ? 'All checks passed' : 'Some checks failed'}
            </div>
          )}
        </>
      )}
    </div>
  )
}
