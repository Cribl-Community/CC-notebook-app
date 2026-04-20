/**
 * Editor helpers for `%%cribl_search` cells: KQL region detection, tokenization,
 * and Tab completions (header + KQL body). Aligns with `parseCriblSearchMagic`.
 */

import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete'

export type CriblSearchCellInfo =
  | { kind: 'none' }
  | { kind: 'cribl_search'; kqlFrom: number; kqlTo: number }

const MAGIC_FIRST_LINE = /^%%cribl_search(?:\s+(.*))?$/

/** Same first-line rule as `parseCriblSearchMagic` (trimmed line, BOM stripped). */
export function analyzeCriblSearchCell(code: string): CriblSearchCellInfo {
  const text = code.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const firstLine = (lines[0] ?? '').trimStart().trimEnd()
  if (!MAGIC_FIRST_LINE.test(firstLine)) return { kind: 'none' }
  const firstNl = text.indexOf('\n')
  const kqlFrom = firstNl === -1 ? text.length : firstNl + 1
  return { kind: 'cribl_search', kqlFrom, kqlTo: text.length }
}

export type KqlTokenKind =
  | 'keyword'
  | 'pipe'
  | 'string'
  | 'number'
  | 'identifier'
  | 'operator'
  | 'comment'

export type KqlToken = { from: number; to: number; kind: KqlTokenKind }

const KQL_KEYWORDS = new Set(
  (
    [
      'and',
      'or',
      'not',
      'by',
      'on',
      'as',
      'of',
      'in',
      'between',
      'contains',
      'has',
      'has_any',
      'has_all',
      'where',
      'project',
      'project-away',
      'summarize',
      'join',
      'union',
      'take',
      'limit',
      'top',
      'sort',
      'order',
      'desc',
      'asc',
      'ascending',
      'descending',
      'extend',
      'parse',
      'evaluate',
      'render',
      'mv-expand',
      'mvexpand',
      'distinct',
      'count',
      'bin',
      'sample',
      'search',
      'cribl',
      'dataset',
      'datatable',
      'range',
      'make-series',
      'true',
      'false',
      'null',
      'bool',
      'int',
      'long',
      'real',
      'string',
      'datetime',
      'timespan',
      'dynamic',
      'ago',
      'now',
      'startofday',
      'endofday',
      'dcount',
      'countif',
      'avg',
      'sum',
      'min',
      'max',
      'stdev',
      'case',
      'iff',
      'iif',
    ] as const
  ).map((k) => k.toLowerCase()),
)

/** Keywords suggested after a pipe (tabular / query operators). */
export const KQL_AFTER_PIPE: readonly string[] = [
  'where',
  'project',
  'project-away',
  'summarize',
  'extend',
  'join',
  'union',
  'take',
  'limit',
  'top',
  'sort',
  'order',
  'distinct',
  'parse',
  'mv-expand',
  'search',
  'cribl',
  'dataset',
  'bin',
  'sample',
]

function isIdentChar(c: string): boolean {
  return /[A-Za-z0-9_]/.test(c)
}

function readIdentifier(slice: string, start: number): { end: number; text: string } {
  let j = start
  if (j >= slice.length || !/[A-Za-z_]/.test(slice[j]!)) return { end: start, text: '' }
  j++
  while (j < slice.length && isIdentChar(slice[j]!)) j++
  while (j < slice.length && slice[j] === '-' && j + 1 < slice.length && isIdentChar(slice[j + 1]!)) {
    j++
    while (j < slice.length && isIdentChar(slice[j]!)) j++
  }
  return { end: j, text: slice.slice(start, j) }
}

function readStringSingle(slice: string, start: number): number {
  let j = start + 1
  while (j < slice.length) {
    const c = slice[j]!
    if (c === "'") {
      if (slice[j + 1] === "'") {
        j += 2
        continue
      }
      return j + 1
    }
    j++
  }
  return slice.length
}

function readStringDouble(slice: string, start: number): number {
  let j = start + 1
  while (j < slice.length) {
    const c = slice[j]!
    if (c === '\\' && j + 1 < slice.length) {
      j += 2
      continue
    }
    if (c === '"') return j + 1
    j++
  }
  return slice.length
}

function readLineComment(slice: string, start: number): number {
  let j = start + 2
  while (j < slice.length && slice[j] !== '\n' && slice[j] !== '\r') j++
  return j
}

function readNumber(slice: string, start: number): number {
  let j = start
  if (slice[j] === '-' || slice[j] === '+') j++
  if (j < slice.length && slice[j] === '0' && j + 1 < slice.length && /[xX]/.test(slice[j + 1]!)) {
    j += 2
    while (j < slice.length && /[0-9a-fA-F_]/.test(slice[j]!)) j++
    return j
  }
  while (j < slice.length && /[0-9_]/.test(slice[j]!)) j++
  if (j < slice.length && slice[j] === '.') {
    j++
    while (j < slice.length && /[0-9_]/.test(slice[j]!)) j++
  }
  if (j < slice.length && /[eE]/.test(slice[j]!)) {
    j++
    if (j < slice.length && /[+-]/.test(slice[j]!)) j++
    while (j < slice.length && /[0-9_]/.test(slice[j]!)) j++
  }
  if (j < slice.length && /[a-zA-Z]/.test(slice[j]!)) {
    j++
    while (j < slice.length && /[A-Za-z0-9_]/.test(slice[j]!)) j++
  }
  return j
}

function readOperator(slice: string, start: number): number {
  const two = slice.slice(start, start + 2)
  const three = slice.slice(start, start + 3)
  if (['==', '!=', '<=', '>=', '=~', '!~', 'in'].includes(two)) return start + 2
  if (three === '!in') return start + 3
  return start + 1
}

/** Tokenize KQL text between `kqlFrom` (inclusive) and `kqlTo` (exclusive). */
export function tokenizeKqlRegion(code: string, kqlFrom: number, kqlTo: number): KqlToken[] {
  const slice = code.slice(kqlFrom, kqlTo)
  const out: KqlToken[] = []
  let i = 0
  while (i < slice.length) {
    const c = slice[i]!
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++
      continue
    }
    const abs = (localFrom: number, localTo: number, kind: KqlTokenKind) => {
      out.push({ from: kqlFrom + localFrom, to: kqlFrom + localTo, kind })
    }

    if (c === '/' && slice[i + 1] === '/') {
      const end = readLineComment(slice, i)
      abs(i, end, 'comment')
      i = end
      continue
    }

    if (c === '|') {
      abs(i, i + 1, 'pipe')
      i++
      continue
    }

    if (c === "'") {
      const end = readStringSingle(slice, i)
      abs(i, end, 'string')
      i = end
      continue
    }

    if (c === '"') {
      const end = readStringDouble(slice, i)
      abs(i, end, 'string')
      i = end
      continue
    }

    if (/[0-9]/.test(c) || (c === '-' && i + 1 < slice.length && /[0-9]/.test(slice[i + 1]!))) {
      const end = readNumber(slice, i)
      abs(i, end, 'number')
      i = end
      continue
    }

    if (/[A-Za-z_]/.test(c)) {
      const { end, text } = readIdentifier(slice, i)
      const low = text.toLowerCase()
      const kind: KqlTokenKind = KQL_KEYWORDS.has(low) ? 'keyword' : 'identifier'
      abs(i, end, kind)
      i = end
      continue
    }

    if (/[=!<>]/.test(c) || c === '+' || c === '-' || c === '*' || c === '/' || c === '%') {
      const end = readOperator(slice, i)
      abs(i, end, 'operator')
      i = end
      continue
    }

    if (c === '(' || c === ')' || c === '[' || c === ']' || c === '{' || c === '}' || c === ',' || c === ';') {
      abs(i, i + 1, 'operator')
      i++
      continue
    }

    abs(i, i + 1, 'operator')
    i++
  }
  return out
}

const MAGIC_FULL = '%%cribl_search'

function headerReplaceBounds(code: string, pos: number): { from: number; to: number } {
  const before = code.slice(0, pos)
  const lastNl = before.lastIndexOf('\n')
  const line = before.slice(lastNl + 1)
  const j = line.length
  let k = j - 1
  while (k >= 0 && /[^\s]/.test(line[k]!)) k--
  const from = pos - (j - k - 1)
  const to = pos
  return { from, to }
}

function kqlWordBounds(code: string, pos: number): { from: number; to: number } {
  const before = code.slice(0, pos)
  const lastNl = before.lastIndexOf('\n')
  const line = before.slice(lastNl + 1)
  const j = line.length
  let i = j - 1
  while (i >= 0 && /[a-zA-Z0-9_]/.test(line[i]!)) i--
  return { from: pos - (j - i - 1), to: pos }
}

export function criblSearchCompletionSource(context: CompletionContext): CompletionResult | null {
  const code = context.state.doc.toString()
  const pos = context.pos
  const info = analyzeCriblSearchCell(code)
  if (info.kind !== 'cribl_search') return null

  const line = context.state.doc.lineAt(pos)

  if (line.number === 1) {
    return headerCompletions(code, pos)
  }

  if (pos < info.kqlFrom) return null

  return kqlCompletions(code, pos)
}

function headerCompletions(code: string, pos: number): CompletionResult | null {
  const lineStart = code.lastIndexOf('\n', pos - 1) + 1
  const lineToCursor = code.slice(lineStart, pos)
  const trimmed = lineToCursor.trimStart()
  if (!trimmed.startsWith('%')) return null

  if (!trimmed.startsWith(MAGIC_FULL)) {
    if (!MAGIC_FULL.startsWith(trimmed)) return null
    const { from, to } = headerReplaceBounds(code, pos)
    return {
      from,
      to,
      filter: false,
      options: [{ label: MAGIC_FULL, type: 'keyword', apply: MAGIC_FULL }],
    }
  }

  const afterMagic = trimmed.slice(MAGIC_FULL.length)
  const rest = afterMagic.trimStart()
  const tokens = rest.split(/\s+/).filter(Boolean)
  const lastTok = tokens[tokens.length - 1] ?? ''

  if (
    /^var=.+/u.test(lastTok) ||
    /^preview=.+/u.test(lastTok) ||
    /^limit=.+/u.test(lastTok) ||
    /^lang=.+/u.test(lastTok) ||
    /^earliest=.+/u.test(lastTok) ||
    /^latest=.+/u.test(lastTok)
  ) {
    return null
  }

  const paramCandidates: { label: string; type: string }[] = []
  const partial = lastTok

  const wantVar =
    partial === '' ||
    'var='.startsWith(partial) ||
    (partial.length > 0 && 'var'.startsWith(partial))
  const wantPreview =
    partial === '' ||
    'preview='.startsWith(partial) ||
    (partial.length > 0 && 'preview'.startsWith(partial))
  const wantEarliest =
    partial === '' ||
    'earliest='.startsWith(partial) ||
    (partial.length > 0 && 'earliest'.startsWith(partial))
  const wantLatest =
    partial === '' ||
    'latest='.startsWith(partial) ||
    (partial.length > 0 && 'latest'.startsWith(partial))
  const wantLimit =
    partial === '' ||
    'limit='.startsWith(partial) ||
    (partial.length > 0 && 'limit'.startsWith(partial))
  const wantLang =
    partial === '' ||
    'lang='.startsWith(partial) ||
    (partial.length > 0 && 'lang'.startsWith(partial))

  if (wantVar) paramCandidates.push({ label: 'var=', type: 'property' })
  if (wantPreview) paramCandidates.push({ label: 'preview=', type: 'property' })
  if (wantLimit) paramCandidates.push({ label: 'limit=', type: 'property' })
  if (wantLang) paramCandidates.push({ label: 'lang=', type: 'property' })
  if (wantEarliest) paramCandidates.push({ label: 'earliest=', type: 'property' })
  if (wantLatest) paramCandidates.push({ label: 'latest=', type: 'property' })

  if (!paramCandidates.length) return null

  const { from, to } =
    lastTok.length > 0 ? headerReplaceBounds(code, pos) : { from: pos, to: pos }

  return {
    from,
    to,
    filter: false,
    options: paramCandidates.map((o) => ({ ...o, apply: o.label })),
  }
}

function kqlCompletions(code: string, pos: number): CompletionResult | null {
  const lineStart = code.lastIndexOf('\n', pos - 1) + 1
  const lineBefore = code.slice(lineStart, pos)
  const lastPipe = lineBefore.lastIndexOf('|')
  const afterPipe = lastPipe >= 0 ? lineBefore.slice(lastPipe + 1).trim() : lineBefore.trim()

  const { from, to } = kqlWordBounds(code, pos)
  const partial = code.slice(from, to).toLowerCase()

  let pool: readonly string[] = Array.from(KQL_KEYWORDS).sort()

  if (lastPipe >= 0 && (afterPipe === '' || /^[a-zA-Z_]*$/.test(afterPipe))) {
    pool = KQL_AFTER_PIPE
  }

  const options = pool
    .filter((kw) => partial === '' || kw.startsWith(partial))
    .slice(0, 80)
    .map((kw) => ({ label: kw, type: 'keyword' as const }))

  if (!options.length) return null

  return {
    from,
    to,
    filter: false,
    options,
  }
}
