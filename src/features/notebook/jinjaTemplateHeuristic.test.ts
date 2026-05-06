import { describe, expect, it } from 'vitest'
import { looksLikeJinjaTemplate } from '@features/notebook/jinjaTemplateHeuristic'

describe('looksLikeJinjaTemplate', () => {
  it('detects common delimiters', () => {
    expect(looksLikeJinjaTemplate('dataset=x | where a == {{ b }}')).toBe(true)
    expect(looksLikeJinjaTemplate('{% for x in y %}')).toBe(true)
    expect(looksLikeJinjaTemplate('{# c #}')).toBe(true)
    expect(looksLikeJinjaTemplate('plain text')).toBe(false)
  })
})
