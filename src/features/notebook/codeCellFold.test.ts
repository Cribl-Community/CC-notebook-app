import { describe, expect, it } from 'vitest'
import {
  applyExampleDefaultCodeFold,
  codeCellMetadataForIpynb,
  isLongCodeCellForDefaultFold,
  parseCodeFoldedFromCellMetadata,
} from '@features/notebook/codeCellFold'
import type { Cell } from '@features/notebook/model/types'
import { RIPTIDE_CELL_PROMPT_HEADER } from '@features/ai-riptide/riptideService'

function codeCell(overrides: Partial<Extract<Cell, { cell_type: 'code' }>>): Extract<Cell, { cell_type: 'code' }> {
  return {
    id: 'c1',
    cell_type: 'code',
    source: '',
    outputs: [],
    execution_count: null,
    execution_state: 'idle',
    ...overrides,
  }
}

describe('parseCodeFoldedFromCellMetadata / codeCellMetadataForIpynb', () => {
  it('parses boolean from notebook_app.code_folded', () => {
    expect(parseCodeFoldedFromCellMetadata({ notebook_app: { code_folded: true } })).toBe(true)
    expect(parseCodeFoldedFromCellMetadata({ notebook_app: { code_folded: false } })).toBe(false)
  })
  it('returns undefined when absent or invalid', () => {
    expect(parseCodeFoldedFromCellMetadata({})).toBeUndefined()
    expect(parseCodeFoldedFromCellMetadata({ notebook_app: {} })).toBeUndefined()
    expect(parseCodeFoldedFromCellMetadata({ notebook_app: { code_folded: 'yes' } })).toBeUndefined()
  })
  it('serialises only when defined', () => {
    expect(codeCellMetadataForIpynb(undefined)).toEqual({})
    expect(codeCellMetadataForIpynb(true)).toEqual({ notebook_app: { code_folded: true } })
    expect(codeCellMetadataForIpynb(false)).toEqual({ notebook_app: { code_folded: false } })
  })
})

describe('isLongCodeCellForDefaultFold', () => {
  it('is false for exactly 10 lines', () => {
    expect(isLongCodeCellForDefaultFold([...Array(10)].map((_, i) => i).join('\n'))).toBe(false)
  })
  it('is true for 11 lines', () => {
    expect(isLongCodeCellForDefaultFold([...Array(11)].map((_, i) => i).join('\n'))).toBe(true)
  })
})

describe('applyExampleDefaultCodeFold', () => {
  const longPlain = [...Array(11)].map((_, i) => `print(${i})`).join('\n')
  const longRiptide = `# ${RIPTIDE_CELL_PROMPT_HEADER}\n# Hello\n\n${'x\n'.repeat(12)}`

  it('folds long plain cells when codeFolded is unset', () => {
    const cells: Cell[] = [codeCell({ source: longPlain })]
    const next = applyExampleDefaultCodeFold(cells)
    expect(next[0]?.cell_type === 'code' && next[0].codeFolded).toBe(true)
  })

  it('does not fold Riptide ### Prompt cells', () => {
    const cells: Cell[] = [codeCell({ source: longRiptide })]
    const next = applyExampleDefaultCodeFold(cells)
    expect(next[0]?.cell_type === 'code' && next[0].codeFolded).toBe(false)
  })

  it('does not override explicit false when opening as example', () => {
    const cells: Cell[] = [codeCell({ source: longPlain, codeFolded: false })]
    const next = applyExampleDefaultCodeFold(cells)
    expect(next[0]?.cell_type === 'code' && next[0].codeFolded).toBe(false)
  })
})
