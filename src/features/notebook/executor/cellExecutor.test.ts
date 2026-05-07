import { describe, it, expect, vi } from 'vitest'
import type { CellExecutor, CellExecutionContext } from './cellExecutor'
import { selectExecutor } from './cellExecutor'
import { looksLikeCriblApiMagic } from './criblApiExecutor'
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
  it('matches only when first non-comment non-empty line starts with %%cribl_search', () => {
    expect(looksLikeCriblSearchMagic('%%cribl_search foo')).toBe(true)
    expect(looksLikeCriblSearchMagic('%%cribl_search var=df\nfoo')).toBe(true)
    expect(looksLikeCriblSearchMagic('\n\n  %%cribl_search foo')).toBe(true)
    expect(looksLikeCriblSearchMagic('# intro\n%%cribl_search foo')).toBe(true)
    // A single % is the IPython line-magic prefix; the cribl magic is a
    // cell magic (%%...) so a single percent must NOT match.
    expect(looksLikeCriblSearchMagic('%cribl_search foo')).toBe(false)
    expect(looksLikeCriblSearchMagic('print("hi")')).toBe(false)
    expect(looksLikeCriblSearchMagic('# %%cribl_search (in comment)')).toBe(false)
    expect(looksLikeCriblSearchMagic('')).toBe(false)
  })
})

describe('looksLikeCriblApiMagic', () => {
  it('matches when the first non-comment line starts with %%cribl_api', () => {
    expect(looksLikeCriblApiMagic('%%cribl_api GET /system/info')).toBe(true)
    expect(looksLikeCriblApiMagic('# h\n%%cribl_api GET /system/info')).toBe(true)
    expect(looksLikeCriblApiMagic('# %%cribl_api')).toBe(false)
    expect(looksLikeCriblApiMagic('print(1)')).toBe(false)
  })
})

describe('executor registry', () => {
  // Regression: a %%cribl_search cell used to fall through to pythonExecutor
  // (matcher checked %cribl_search with a single percent) and the kernel
  // would raise `SyntaxError: invalid syntax` on line 1.
  it('routes a %%cribl_search cell to the criblSearchExecutor and NOT to pythonExecutor', async () => {
    const { DEFAULT_CELL_EXECUTORS } = await import('./executorRegistry')
    const source = '%%cribl_search var=kql_df\ndataset=cribl_search_sample | limit 1000'
    expect(selectExecutor(source, DEFAULT_CELL_EXECUTORS)?.name).toBe('cribl-search')
  })

  it('routes a %%cribl_api cell to the criblApiExecutor before the search executor', async () => {
    const { DEFAULT_CELL_EXECUTORS } = await import('./executorRegistry')
    const source = '%%cribl_api GET /m/default_search/search/jobs var=jobs\n'
    expect(selectExecutor(source, DEFAULT_CELL_EXECUTORS)?.name).toBe('cribl-api')
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
      execute: vi.fn().mockImplementation(async () => {}),
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
