/**
 * Shared rules for Jupyter-style `%%cribl_*` cell magics: locating the header line and
 * building the body while ignoring full-line `#` comments.
 */

/** Empty lines and full-line `#` comments are skipped when locating the `%%` magic header. */
export function lineSkipsMagicScan(line: string): boolean {
  const t = line.trim()
  return t === '' || t.startsWith('#')
}

/** Full-line `#` comments are omitted from the query / YAML body (blank lines are kept). */
export function lineExcludedFromMagicBody(line: string): boolean {
  return line.trim().startsWith('#')
}

/** Index of the first line that is not skipped for magic scan, or `-1` if none. */
export function findFirstMagicHeaderLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (!lineSkipsMagicScan(lines[i]!)) return i
  }
  return -1
}

/** Character offset of the start of `lines[lineIndex]` in `source` (must match `source.split(/\\r?\\n/)`). */
export function offsetOfLineStart(source: string, lines: string[], lineIndex: number): number {
  let o = 0
  for (let j = 0; j < lineIndex; j++) {
    o += lines[j]!.length
    if (o >= source.length) return source.length
    if (source.slice(o, o + 2) === '\r\n') {
      o += 2
    } else if (source[o] === '\n' || source[o] === '\r') {
      o += 1
    }
  }
  return o
}

/** Offset immediately after the newline(s) following `lines[lineIndex]`, or `source.length` if none. */
export function offsetAfterLineWithNewline(source: string, lines: string[], lineIndex: number): number {
  const start = offsetOfLineStart(source, lines, lineIndex)
  const o = start + lines[lineIndex]!.length
  if (o >= source.length) return source.length
  if (source.slice(o, o + 2) === '\r\n') return o + 2
  if (source[o] === '\n' || source[o] === '\r') return o + 1
  return o
}
