const METHOD_RE = /^(GET|POST|PUT|PATCH|DELETE)/
const PATH_RE = /^(\/[^ \t\r\n]*)/

/**
 * When the cursor is in the `path` token of the first `%%cribl_api` line, returns replace bounds
 * and prefix. Aligns with `parseCriblApiMagic` (path is one token, then `var=`, etc.).
 */
export function getCriblApiPathEditContext(
  firstLine: string,
  lineFrom: number,
  pos: number,
): { pathFrom: number; pathTo: number; pathPrefix: string; method: string } | null {
  const t = firstLine.replace(/^\uFEFF/, '')
  const posInLine = pos - lineFrom
  if (posInLine < 0 || posInLine > t.length) return null

  const m = t.match(/^\s*(%%cribl_api)\s+/)
  if (!m) return null
  const headLen = m[0]!.length
  if (posInLine < headLen) return null

  const rest = t.slice(headLen)
  const rel = posInLine - headLen

  const me = METHOD_RE.exec(rest)
  if (!me) return null
  const method = me[0]!
  const afterMethod = me[0]!.length
  if (rel < afterMethod) return null
  if (rest[afterMethod] !== ' ' && rest[afterMethod] !== '\t') return null

  let p = afterMethod
  while (p < rest.length && (rest[p] === ' ' || rest[p] === '\t')) p++
  if (rel < p) return null

  const afterTail = rest.slice(p)
  if (afterTail.length > 0 && (afterTail.startsWith('var=') || !afterTail.startsWith('/'))) return null

  const pathFrom = lineFrom + headLen + p
  if (pos < pathFrom) return null

  const pr = PATH_RE.exec(afterTail)
  const pathStr = pr ? pr[1]! : ''
  if (!pathStr) {
    return { pathFrom, pathTo: pos, pathPrefix: firstLine.slice(pathFrom - lineFrom, pos - lineFrom), method }
  }
  const endOfPath = pathFrom + pathStr.length
  if (pos < pathFrom || pos > endOfPath) return null
  return {
    pathFrom,
    pathTo: pos,
    pathPrefix: firstLine.slice(pathFrom - lineFrom, pos - lineFrom),
    method,
  }
}
