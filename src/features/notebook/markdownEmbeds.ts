import type { NotebookState } from '@features/notebook/model/types'
import { serializeNotebookToIpynbJson } from '@features/notebook/codec/ipynb'

/** Max decoded bytes per `data:image/...;base64,...` segment inside markdown cell source. */
export const MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES = 512 * 1024

export function markdownImageTooLargeUserMessage(): string {
  return `Image is too large to embed in markdown (max ${MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES / 1024} KB per image).`
}

/** Max UTF-8 size of the serialized `.ipynb` JSON (includes code outputs). */
export const MAX_NOTEBOOK_JSON_UTF8_BYTES = 6 * 1024 * 1024

const DATA_IMAGE_BASE64_RE =
  /data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=\s\r\n]+)/gi

/** Markdown `![alt](data:image/...;base64,...)` blocks we surface as previews while editing. */
const MARKDOWN_DATA_IMAGE_BLOCK_RE =
  /!\[([^\]]*)\]\((data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=\s\r\n]+)\)/gi

export type MarkdownDataImageEditSegment =
  | { kind: 'text'; text: string }
  | { kind: 'embed'; alt: string; dataUrl: string }

export function splitMarkdownByDataImageEmbeds(source: string): MarkdownDataImageEditSegment[] {
  if (source.length === 0) return [{ kind: 'text', text: '' }]
  const parts: MarkdownDataImageEditSegment[] = []
  MARKDOWN_DATA_IMAGE_BLOCK_RE.lastIndex = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = MARKDOWN_DATA_IMAGE_BLOCK_RE.exec(source)) !== null) {
    if (m.index > last) {
      parts.push({ kind: 'text', text: source.slice(last, m.index) })
    }
    parts.push({ kind: 'embed', alt: m[1] ?? '', dataUrl: m[2] ?? '' })
    last = m.index + m[0].length
  }
  if (last < source.length) {
    parts.push({ kind: 'text', text: source.slice(last) })
  }
  if (parts.length > 0 && parts[parts.length - 1].kind === 'embed') {
    parts.push({ kind: 'text', text: '' })
  }
  if (parts.length > 0 && parts[0].kind === 'embed') {
    parts.unshift({ kind: 'text', text: '' })
  }
  return parts
}

export function joinMarkdownDataImageEmbeds(segments: MarkdownDataImageEditSegment[]): string {
  return segments.map((s) => (s.kind === 'text' ? s.text : `![${s.alt}](${s.dataUrl})`)).join('')
}

export function mergeAdjacentMarkdownTextSegments(
  segments: MarkdownDataImageEditSegment[],
): MarkdownDataImageEditSegment[] {
  const out: MarkdownDataImageEditSegment[] = []
  for (const s of segments) {
    if (s.kind === 'text' && out.length > 0 && out[out.length - 1].kind === 'text') {
      const prev = out[out.length - 1] as { kind: 'text'; text: string }
      prev.text += s.text
    } else {
      out.push(s)
    }
  }
  return out.length > 0 ? out : [{ kind: 'text', text: '' }]
}

export function decodedBase64ByteLength(base64: string): number {
  const s = base64.replace(/\s+/g, '')
  if (s.length === 0) return 0
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0
  return Math.floor((s.length * 3) / 4) - pad
}

/**
 * Throws if any markdown cell contains an embedded data-URI image over
 * {@link MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES}. Does not inspect code-cell outputs.
 */
export function assertMarkdownEmbedsWithinLimits(notebook: NotebookState): void {
  for (const cell of notebook.cells) {
    if (cell.cell_type !== 'markdown') continue
    const text = cell.source
    DATA_IMAGE_BASE64_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = DATA_IMAGE_BASE64_RE.exec(text)) !== null) {
      const b64 = m[2] ?? ''
      const n = decodedBase64ByteLength(b64)
      if (n > MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES) {
        throw new Error(
          `An image embedded in markdown is too large (max ${MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES} bytes per image).`,
        )
      }
    }
  }
}

export function assertNotebookJsonUtf8WithinLimit(json: string): void {
  const n = new TextEncoder().encode(json).length
  if (n > MAX_NOTEBOOK_JSON_UTF8_BYTES) {
    throw new Error(
      `Notebook file is too large to save (max ${MAX_NOTEBOOK_JSON_UTF8_BYTES} bytes).`,
    )
  }
}

/** Run markdown data-URI checks plus full JSON size (save only — import uses {@link assertMarkdownEmbedsWithinLimits} so large plot outputs can still open). */
export function assertNotebookPersistable(notebook: NotebookState): void {
  assertMarkdownEmbedsWithinLimits(notebook)
  assertNotebookJsonUtf8WithinLimit(serializeNotebookToIpynbJson(notebook))
}

export function fileFitsMarkdownEmbedLimit(file: File): boolean {
  return file.size <= MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES
}

/**
 * Read an image file as `data:image/...;base64,...` or return null if too large / wrong type.
 */
export async function readImageFileAsDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith('image/')) return null
  if (!fileFitsMarkdownEmbedLimit(file)) return null
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const url = typeof r.result === 'string' ? r.result : null
      if (!url || !url.startsWith('data:image/')) {
        resolve(null)
        return
      }
      const comma = url.indexOf(',')
      if (comma < 0) {
        resolve(null)
        return
      }
      const meta = url.slice(0, comma)
      const payload = url.slice(comma + 1)
      if (!/;base64$/i.test(meta)) {
        resolve(null)
        return
      }
      const decoded = decodedBase64ByteLength(payload)
      if (decoded > MAX_MARKDOWN_EMBEDDED_IMAGE_BYTES) {
        resolve(null)
        return
      }
      resolve(url)
    }
    r.onerror = () => reject(new Error('Could not read image file'))
    r.readAsDataURL(file)
  })
}
