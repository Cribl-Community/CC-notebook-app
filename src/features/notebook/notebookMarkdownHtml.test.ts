import { describe, expect, it } from 'vitest'
import { renderNotebookMarkdownToSafeHtml } from '@features/notebook/notebookMarkdownHtml'

const TINY_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAwUBAO2GZFQAAAAASUVORK5CYII='

describe('renderNotebookMarkdownToSafeHtml', () => {
  it('preserves allowed data:image/png on img', () => {
    const md = `![alt](data:image/png;base64,${TINY_PNG_B64})`
    const html = renderNotebookMarkdownToSafeHtml(md)
    expect(html).toContain('<img')
    expect(html).toContain(`data:image/png;base64,${TINY_PNG_B64}`)
  })

  it('strips dangerous data:image/svg+xml src', () => {
    const md =
      '![](data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+)'
    const html = renderNotebookMarkdownToSafeHtml(md)
    expect(html).not.toMatch(/data:image\/svg/i)
  })

  it('allows https image URLs', () => {
    const md = '![](https://example.com/x.png)'
    const html = renderNotebookMarkdownToSafeHtml(md)
    expect(html).toContain('https://example.com/x.png')
  })
})
