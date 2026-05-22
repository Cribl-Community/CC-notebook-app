import { describe, expect, it, vi } from 'vitest'
import type { KernelPort } from '@ports/KernelPort'
import { buildCellConditionProbeCode, evaluateCellRunCondition } from './cellConditionEval'

describe('buildCellConditionProbeCode', () => {
  it('contains eval anchor and json.loads wrapper', () => {
    const code = buildCellConditionProbeCode('1 < 2')
    expect(code).toContain('"<run condition>"')
    expect(code).toContain('__NB_COND_JSON__:')
    expect(code).toContain('1 < 2')
  })
})

describe('evaluateCellRunCondition', () => {
  it('parses true/false/error from stdout marker', async () => {
    const kernel: KernelPort = {
      ready: Promise.resolve(),
      execute: vi.fn().mockResolvedValue({
        outputs: [{ output_type: 'stream', name: 'stdout', text: '__NB_COND_JSON__:{"outcome":"false"}\n' }],
      }),
      complete: vi.fn().mockResolvedValue([]),
      interrupt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    }
    const r = await evaluateCellRunCondition(kernel, 'False')
    expect(r).toEqual({ outcome: 'false', skipBody: true })
  })

  it('returns error when marker is missing', async () => {
    const kernel: KernelPort = {
      ready: Promise.resolve(),
      execute: vi.fn().mockResolvedValue({ outputs: [] }),
      complete: vi.fn().mockResolvedValue([]),
      interrupt: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn(),
    }
    const r = await evaluateCellRunCondition(kernel, 'True')
    expect(r.outcome).toBe('error')
    expect(r.skipBody).toBe(true)
  })
})
