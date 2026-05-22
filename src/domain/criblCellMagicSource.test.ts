import { describe, expect, it } from 'vitest'
import {
  findFirstMagicHeaderLineIndex,
  lineExcludedFromMagicBody,
  lineSkipsMagicScan,
  offsetAfterLineWithNewline,
  offsetOfLineStart,
} from '@/domain/criblCellMagicSource'

describe('lineSkipsMagicScan', () => {
  it('skips empty and whitespace-only lines', () => {
    expect(lineSkipsMagicScan('')).toBe(true)
    expect(lineSkipsMagicScan('   ')).toBe(true)
  })
  it('skips full-line # comments', () => {
    expect(lineSkipsMagicScan('# x')).toBe(true)
    expect(lineSkipsMagicScan('  # x')).toBe(true)
  })
  it('does not skip non-comment content', () => {
    expect(lineSkipsMagicScan('%%cribl_search')).toBe(false)
    expect(lineSkipsMagicScan(' x')).toBe(false)
  })
})

describe('lineExcludedFromMagicBody', () => {
  it('drops # lines but keeps blanks', () => {
    expect(lineExcludedFromMagicBody('# a')).toBe(true)
    expect(lineExcludedFromMagicBody('')).toBe(false)
    expect(lineExcludedFromMagicBody('  ')).toBe(false)
  })
})

describe('findFirstMagicHeaderLineIndex', () => {
  it('finds index after comments and blanks', () => {
    expect(findFirstMagicHeaderLineIndex(['# c', '', '%%m'])).toBe(2)
    expect(findFirstMagicHeaderLineIndex(['%%m'])).toBe(0)
    expect(findFirstMagicHeaderLineIndex(['# only'])).toBe(-1)
  })
})

describe('offsets', () => {
  it('maps line indices to source offsets', () => {
    const source = '# a\n\n%%cribl_search x\nq'
    const lines = source.split(/\r?\n/)
    expect(lines).toEqual(['# a', '', '%%cribl_search x', 'q'])
    expect(offsetOfLineStart(source, lines, 0)).toBe(0)
    expect(offsetOfLineStart(source, lines, 2)).toBe(source.indexOf('%%'))
    expect(offsetAfterLineWithNewline(source, lines, 2)).toBe(source.indexOf('q'))
  })
  it('handles CRLF', () => {
    const source = '#\r\n%%m\r\nb'
    const lines = source.split(/\r?\n/)
    expect(offsetAfterLineWithNewline(source, lines, 1)).toBe(source.length - 1)
  })
})
