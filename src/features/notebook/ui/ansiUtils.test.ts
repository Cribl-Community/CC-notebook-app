import { describe, expect, it } from 'vitest'
import { extractCellLineRefs } from '@features/notebook/ui/ansiUtils'

describe('extractCellLineRefs', () => {
  it('parses Pyodide / notebook compile filename <cell>', () => {
    const tb = [
      'Traceback (most recent call last):',
      '  File "<cell>", line 3, in <module>',
      '    1 / 0',
      'ZeroDivisionError: division by zero',
    ]
    expect(extractCellLineRefs(tb)).toEqual([3])
  })

  it('parses classic <string> exec frames', () => {
    const tb = ['  File "<string>", line 2, in <module>', 'NameError: x']
    expect(extractCellLineRefs(tb)).toEqual([2])
  })

  it('parses IPython-style Input In [n], line m', () => {
    const tb = ['  Input In [1], line 4, in <module>', '    raise ValueError']
    expect(extractCellLineRefs(tb)).toEqual([4])
  })

  it('ignores real filesystem frames', () => {
    const tb = [
      '  File "/lib/python3.11/site-packages/foo.py", line 99, in bar',
      '  File "<cell>", line 1, in <module>',
    ]
    expect(extractCellLineRefs(tb)).toEqual([1])
  })

  it('keeps only the innermost <cell> frame when several appear', () => {
    const tb = [
      'Traceback (most recent call last):',
      '  File "<cell>", line 1, in <module>',
      '    outer()',
      '  File "<cell>", line 4, in outer',
      '    inner()',
      '  File "<cell>", line 7, in inner',
      '    1 / 0',
    ]
    expect(extractCellLineRefs(tb)).toEqual([7])
  })
})
