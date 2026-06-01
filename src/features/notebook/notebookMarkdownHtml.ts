import dompurify from 'dompurify'
import { marked } from 'marked'

type PurifyInstance = {
  sanitize: (dirty: string, cfg?: import('dompurify').Config) => string
  addHook: (
    name: 'uponSanitizeAttribute',
    fn: (node: Element, data: UponSanitizeAttributeData) => void,
  ) => void
}

interface UponSanitizeAttributeData {
  attrName: string
  attrValue: string
  keepAttr: boolean
}

function createIsolatedMarkdownPurifier(): PurifyInstance {
  const factory = dompurify as unknown as (root?: Window) => PurifyInstance
  return factory(typeof window !== 'undefined' ? window : undefined)
}

const markdownPurify = createIsolatedMarkdownPurifier()

markdownPurify.addHook('uponSanitizeAttribute', (node: Element, data: UponSanitizeAttributeData) => {
  if (data.attrName !== 'src' || node.nodeName !== 'IMG') return
  const v = data.attrValue.trim()
  if (v === '') {
    data.keepAttr = false
    return
  }
  if (/^https?:\/\//i.test(v)) return
  if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(v)) return
  data.keepAttr = false
})

const SANITIZE_MARKDOWN: import('dompurify').Config = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: ['target', 'rel'],
  FORBID_TAGS: ['script'],
}

/**
 * Render GitHub-flavored markdown to sanitized HTML for notebook markdown cells
 * and `text/markdown` outputs. Allows only http(s) or whitelisted data:image base64
 * URLs on `<img src>`.
 */
export function renderNotebookMarkdownToSafeHtml(markdownSource: string): string {
  const raw = marked.parse(markdownSource || '_Double-click to edit…_', { async: false }) as string
  return markdownPurify.sanitize(raw, SANITIZE_MARKDOWN) as string
}
