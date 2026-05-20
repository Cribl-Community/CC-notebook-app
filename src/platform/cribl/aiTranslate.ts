import { getCriblApiBase } from '@platform/cribl/kvstore'
import { describeFetchError } from '@platform/cribl/fetchFailure'

export const AI_INTERNAL_TRANSLATE_PATH = '/ai/q/agents/kql' as const
export const AI_TRANSLATE_TIMEOUT_MS = 20_000

/** Verbs after `|` that indicate a Kusto/Cribl-style pipeline (models often use `top` vs `take`/`limit`). */
const KQL_PIPE_HEAD =
  /\|\s*(where|limit|sort|project|project-away|summarize|extend|join|take|top|distinct|count|union|parse|mv-expand|sample|search|evaluate|make-series)\b/i

function looksLikeKql(text: string): boolean {
  const t = text.trim()
  if (!t) return false
  if (/^cribl\b/i.test(t)) return true
  if (/^let\b/i.test(t)) return true
  if (/^externaldata\b/i.test(t)) return true
  if (/\bdataset\s*=/i.test(t)) return true
  if (KQL_PIPE_HEAD.test(t)) return true
  return false
}

const STOP_MARKERS = [
  /^query_modification$/i,
  /^\[CollectionDescription/i,
  /^\[CollectionName/i,
  /^\[DatasetDescription/i,
  /^\[DatasetName/i,
] as const

function sanitizeKqlCandidate(text: string): string {
  const lines: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (STOP_MARKERS.some((rx) => rx.test(t))) {
      const queryish = /\||=|\b(where|limit|sort|project|project-away|summarize|extend|take|join|top|distinct|count|union|parse|mv-expand|sample|search|evaluate)\b/i.test(
        t,
      )
      if (!queryish) break
    }
    if (/^```/.test(t)) continue
    if (!t.length) {
      if (lines.length > 0) lines.push('')
      continue
    }
    lines.push(line)
  }
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === '') lines.pop()
  return lines.join('\n').trim()
}

function scoreKqlCandidate(text: string): number {
  const t = text.trim()
  if (!t) return -10_000
  let score = 0
  if (/^dataset\s*=/i.test(t) || /^cribl\b/i.test(t)) score += 60
  score += Math.min(5, (t.match(/\|/g) ?? []).length) * 10
  if (
    /\b(where|limit|sort|project|project-away|summarize|extend|take|join|top|distinct|count|union|parse|mv-expand|sample|search|evaluate)\b/i.test(
      t,
    )
  )
    score += 25
  if (/query_modification|CollectionDescription|DatasetDescription/i.test(t)) score -= 500
  score -= Math.floor(Math.max(0, t.length - 500) / 20)
  return score
}

function extractKqlFromJsonLikeString(text: string): string[] {
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return []
  try {
    const parsed = JSON.parse(t) as unknown
    if (!parsed || typeof parsed !== 'object') return []
    const rec = parsed as Record<string, unknown>
    const out: string[] = []
    for (const key of ['kqlQuery', 'kql', 'query', 'translatedQuery', 'translated_kql']) {
      const v = rec[key]
      if (typeof v !== 'string') continue
      const s = sanitizeKqlCandidate(v)
      if (s && looksLikeKql(s)) out.push(s)
    }
    return out
  } catch {
    return []
  }
}

function normalizeCandidate(text: string): string[] {
  const t = text.replace(/\\n/g, '\n').trim()
  if (!t) return []
  const out = new Set<string>()
  for (const jsonCandidate of extractKqlFromJsonLikeString(t)) out.add(jsonCandidate)
  const fenceRe = /```(?:kql|kusto)?\s*([\s\S]*?)```/gi
  for (const m of t.matchAll(fenceRe)) {
    const block = sanitizeKqlCandidate((m[1] ?? '').trim())
    if (block && looksLikeKql(block)) out.add(block)
  }
  const direct = sanitizeKqlCandidate(t.replace(/^```(?:kql|kusto)?\s*/i, '').replace(/```$/i, '').trim())
  if (direct && looksLikeKql(direct)) out.add(direct)
  return [...out]
}

function collectKqlCandidates(raw: unknown, out: Set<string>, depth = 0): void {
  if (depth > 8 || raw == null) return
  if (typeof raw === 'string') {
    for (const c of normalizeCandidate(raw)) out.add(c)
    return
  }
  if (typeof raw !== 'object') return
  if (Array.isArray(raw)) {
    for (const item of raw) collectKqlCandidates(item, out, depth + 1)
    return
  }
  const rec = raw as Record<string, unknown>
  const direct = ['kql', 'query', 'translatedQuery', 'translated_kql', 'content', 'text']
  for (const key of direct) {
    const v = rec[key]
    if (typeof v === 'string') {
      for (const c of normalizeCandidate(v)) out.add(c)
    }
  }
  for (const v of Object.values(rec)) {
    collectKqlCandidates(v, out, depth + 1)
  }
}

function stripSseLinePayload(line: string): string {
  const t = line.trim()
  if (!t.length) return ''
  if (t === '[DONE]' || t.startsWith(':')) return ''
  if (/^data:\s*/i.test(t)) return t.replace(/^data:\s*/i, '').trim()
  return t
}

function parseKqlFromAiResponseBody(body: string): string | null {
  const text = body.trim()
  if (!text) return null
  const candidates = new Set<string>()
  try {
    collectKqlCandidates(JSON.parse(text), candidates)
  } catch {
    // Expected for NDJSON; parse line-by-line below.
  }
  for (const line of text.split(/\r?\n/)) {
    const t = stripSseLinePayload(line)
    if (!t) continue
    try {
      collectKqlCandidates(JSON.parse(t), candidates)
    } catch {
      for (const c of normalizeCandidate(t)) candidates.add(c)
    }
  }
  if (candidates.size === 0) return null
  const best = [...candidates].sort((a, b) => scoreKqlCandidate(b) - scoreKqlCandidate(a))[0]
  if (!best) return null
  return best
    .replace(/^\s+|\s+$/g, '')
    .replace(/^\\n+|\\n+$/g, '')
    .replace(/^\\r+|\\r+$/g, '')
    .trim()
}

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Translate a natural-language query to KQL using Cribl's internal AI endpoint.
 */
export async function translateEnglishToKql(
  englishQuery: string,
  options?: { datasetHint?: string },
): Promise<string> {
  const prompt = englishQuery.trim()
  if (!prompt) throw new Error('English query cannot be empty.')
  const datasetHint = options?.datasetHint?.trim()

  const base = getCriblApiBase() || '/api/v1'
  const url = `${base}${AI_INTERNAL_TRANSLATE_PATH}`
  const ac = new AbortController()
  const timer = globalThis.setTimeout(() => ac.abort(), AI_TRANSLATE_TIMEOUT_MS)

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: randomId(), role: 'user', content: prompt, reqId: 0 }],
        stream: true,
        context: {
          resources: {},
          files: {},
          currentKqlQuery: datasetHint ? `dataset=${datasetHint}` : '',
        },
        sessionId: randomId(),
      }),
      signal: ac.signal,
    })

    const body = await res.text()
    if (!res.ok) {
      throw new Error(`AI translation failed (${res.status}): ${body || res.statusText}`)
    }
    let kql = parseKqlFromAiResponseBody(body)
    if (!kql) {
      throw new Error('AI translation response did not include KQL text.')
    }
    if (datasetHint) {
      // Some responses use placeholders like [CollectionName] for dataset identifiers.
      kql = kql.replace(/\[(CollectionName|DatasetName|dataset)\]/gi, `dataset=${datasetHint}`)
    }
    if (!looksLikeKql(kql)) {
      throw new Error('AI translation did not return a valid KQL statement.')
    }
    return kql
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`AI translation timed out after ${Math.round(AI_TRANSLATE_TIMEOUT_MS / 1000)}s.`)
    }
    throw new Error(describeFetchError(e, 'AI translation request'))
  } finally {
    globalThis.clearTimeout(timer)
  }
}
