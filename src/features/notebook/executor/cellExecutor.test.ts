import { describe, it, expect, vi } from 'vitest'
import type { CellExecutor, CellExecutionContext } from './cellExecutor'
import { selectExecutor } from './cellExecutor'
import { looksLikeCriblSearchMagic } from './criblSearchExecutor'
import { pythonExecutor } from './pythonExecutor'
import { runNotebookCellAfterReady } from './runNotebookCell'
import type { KernelPort } from '@ports/KernelPort'
import type { CellId } from '@features/notebook/model/types'

const noopContext = (
  overrides: Partial<CellExecutionContext> = {},
): CellExecutionContext => ({
  kernel: {
    ready: Promise.resolve(),
    execute: vi.fn().mockResolvedValue({ outputs: [] }),
    complete: vi.fn(),
    dispose: vi.fn(),
  } satisfies KernelPort,
  cellId: 'cell-a' as CellId,
  source: '',
  executionCount: 1,
  emitIOPub: vi.fn(),
  isStale: () => false,
  dispatchNotebook: vi.fn(),
  ...overrides,
})

describe('looksLikeCriblSearchMagic', () => {
  it('matches only when first non-empty line starts with %cribl_search', () => {
    expect(looksLikeCriblSearchMagic('%cribl_search foo')).toBe(true)
    expect(looksLikeCriblSearchMagic('\n\n  %cribl_search foo')).toBe(true)
    expect(looksLikeCriblSearchMagic('print("hi")')).toBe(false)
    expect(looksLikeCriblSearchMagic('# %cribl_search (in comment)')).toBe(false)
    expect(looksLikeCriblSearchMagic('')).toBe(false)
  })
})

describe('selectExecutor', () => {
  it('returns the first matching executor', () => {
    const a: CellExecutor = { name: 'a', matches: (s) => s === 'a', execute: vi.fn() as never }
    const b: CellExecutor = { name: 'b', matches: () => true, execute: vi.fn() as never }
    expect(selectExecutor('a', [a, b])).toBe(a)
    expect(selectExecutor('other', [a, b])).toBe(b)
  })
})

describe('runNotebookCellAfterReady', () => {
  it('routes to an executor chosen by matches() and returns its outcome', async () => {
    const custom: CellExecutor = {
      name: 'custom',
      matches: (s) => s.startsWith('%custom'),
      execute: vi.fn().mockResolvedValue('ok'),
    }
    const result = await runNotebookCellAfterReady({
      ...noopContext({ source: '%custom hi' }),
      executors: [custom, pythonExecutor],
    })
    expect(custom.execute).toHaveBeenCalledTimes(1)
    expect(result).toBe('ok')
  })

  it('falls through to the python executor for plain source', async () => {
    const kernel = {
      ready: Promise.resolve(),
      execute: vi.fn().mockImplementation(async (_src: string, _onIo: unknown, _count: number) => {}),
      complete: vi.fn(),
      dispose: vi.fn(),
    } satisfies KernelPort
    const dispatch = vi.fn()
    const result = await runNotebookCellAfterReady({
      ...noopContext({ source: 'print("hi")', kernel, dispatchNotebook: dispatch }),
    })
    expect(kernel.execute).toHaveBeenCalledTimes(1)
    expect(result).toBe('ok')
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'FINISH_CELL' }),
    )
  })
})
