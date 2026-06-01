import { describe, expect, it } from 'vitest'
import { parseIpynbJson, serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'
import { initialState } from '@features/notebook/reducer/notebookReducer'
import {
  assertMarkdownEmbedsWithinLimits,
  assertNotebookJsonUtf8WithinLimit,
  assertNotebookPersistable,
  decodedBase64ByteLength,
  joinMarkdownDataImageEmbeds,
  MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES,
  MAX_NOTEBOOK_JSON_UTF8_BYTES,
  mergeAdjacentMarkdownTextSegments,
  splitMarkdownByDataImageEmbeds,
} from '@features/notebook/markdownEmbeds'

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwUBAO2GZFQAAAAASUVORK5CYII='

describe('markdown data-image edit segments', () => {
  it('split/join round-trips markdown with one embed', () => {
    const md = `Hi\n\n![x](data:image/png;base64,${TINY_PNG_B64})\n\nBye`
    const segs = splitMarkdownByDataImageEmbeds(md)
    expect(joinMarkdownDataImageEmbeds(segs)).toBe(md)
  })

  it('split adds empty text neighbors when cell is only an embed', () => {
    const md = `![x](data:image/png;base64,${TINY_PNG_B64})`
    const segs = splitMarkdownByDataImageEmbeds(md)
    expect(segs[0]?.kind).toBe('text')
    expect(segs[1]?.kind).toBe('embed')
    expect(segs[2]?.kind).toBe('text')
    expect(joinMarkdownDataImageEmbeds(segs)).toBe(md)
  })

  it('mergeAdjacentMarkdownTextSegments joins neighboring text blocks', () => {
    const merged = mergeAdjacentMarkdownTextSegments([
      { kind: 'text', text: 'a' },
      { kind: 'text', text: 'b' },
    ])
    expect(merged).toEqual([{ kind: 'text', text: 'ab' }])
  })
})

describe('markdownEmbeds', () => {
  it('decodedBase64ByteLength matches atob length for tiny png', () => {
    const n = decodedBase64ByteLength(TINY_PNG_B64)
    expect(n).toBe(atob(TINY_PNG_B64.replace(/\s+/g, '')).length)
  })

  it('assertMarkdownEmbedsWithinLimits allows small markdown data URIs', () => {
    const md = `![x](data:image/png;base64,${TINY_PNG_B64})`
    expect(() =>
      assertMarkdownEmbedsWithinLimits({
        ...initialState,
        title: 't',
        cells: [{ id: '1', cell_type: 'markdown', source: md, editing: false }],
      }),
    ).not.toThrow()
  })

  it('assertMarkdownEmbedsWithinLimits rejects oversized markdown image', () => {
    const raw = new Uint8Array(MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES + 1)
    raw.fill(7)
    const big = Buffer.from(raw).toString('base64')
    const md = `![x](data:image/png;base64,${big})`
    expect(() =>
      assertMarkdownEmbedsWithinLimits({
        ...initialState,
        title: 't',
        cells: [{ id: '1', cell_type: 'markdown', source: md, editing: false }],
      }),
    ).toThrow(/too large/)
  })

  it('ignores code cell outputs (large base64 in output mime only)', () => {
    const json = JSON.stringify({
      nbformat: 4,
      nbformat_minor: 5,
      metadata: { title: 'x' },
      cells: [
        {
          cell_type: 'code',
          source: '1',
          outputs: [
            {
              output_type: 'display_data',
              data: { 'image/png': 'A'.repeat(10_000) },
              metadata: {},
            },
          ],
        },
      ],
    })
    const { title, cells } = parseIpynbJson(json)
    expect(() =>
      assertMarkdownEmbedsWithinLimits({ ...initialState, title, cells }),
    ).not.toThrow()
  })

  it('round-trips markdown with embedded png through ipynb codec', () => {
    const md = `Hello\n\n![x](data:image/png;base64,${TINY_PNG_B64})\n`
    const state = {
      ...initialState,
      title: 'Embed test',
      cells: [{ id: 'm1', cell_type: 'markdown' as const, source: md, editing: false }],
    }
    const json = serializeNotebookToIpynbJson(state)
    const back = parseIpynbJson(json)
    const mdCell = back.cells.find((c) => c.cell_type === 'markdown')
    expect(mdCell?.cell_type).toBe('markdown')
    if (mdCell?.cell_type === 'markdown') {
      expect(mdCell.source).toContain(TINY_PNG_B64)
    }
  })

  it('assertNotebookJsonUtf8WithinLimit throws when over cap', () => {
    const huge = 'x'.repeat(MAX_NOTEBOOK_JSON_UTF8_BYTES + 1)
    expect(() => assertNotebookJsonUtf8WithinLimit(huge)).toThrow(/too large/)
  })

  it('assertNotebookPersistable runs markdown + json checks', () => {
    const md = `![](data:image/png;base64,${TINY_PNG_B64})`
    const state = {
      ...initialState,
      title: 'ok',
      cells: [{ id: 'm1', cell_type: 'markdown' as const, source: md, editing: false }],
    }
    expect(() => assertNotebookPersistable(state)).not.toThrow()
  })
})
