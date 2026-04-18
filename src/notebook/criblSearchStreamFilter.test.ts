import { describe, it, expect } from 'vitest'
import { filterPyodidePackageChatter } from './criblSearchStreamFilter'

describe('filterPyodidePackageChatter', () => {
  it('removes Loading/Loaded lines', () => {
    const s = 'Loading numpy, pandas\nLoaded numpy, pandas\n'
    expect(filterPyodidePackageChatter(s)).toBe('')
  })

  it('keeps real stdout', () => {
    expect(filterPyodidePackageChatter('hello\n')).toBe('hello\n')
  })

  it('removes already loaded and No new packages', () => {
    const s = 'pandas already loaded from default channel\nNo new packages to load\n'
    expect(filterPyodidePackageChatter(s)).toBe('')
  })

  it('preserves mixed content', () => {
    const s = 'Loading x\nprint this\nLoaded y\n'
    expect(filterPyodidePackageChatter(s)).toBe('print this\n')
  })
})
