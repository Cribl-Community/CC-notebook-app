import { resolveCriblAiHost } from './aiHost'

export const AI_TRANSLATE_PATHS = ['/v1/translate/kql', '/v1/translate', '/translate'] as const
export const AI_TRANSLATE_TIMEOUT_MS = 20_000

type AiTranslateResponse = {
  kql?: string
  query?: string
  translatedQuery?: string
  translated_kql?: string
  data?: {
    kql?: string
    query?: string
    translatedQuery?: string
    translated_kql?: string
  }
}

function pickTranslatedKql(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as AiTranslateResponse
  const values = [
    r.kql,
    r.query,
    r.translatedQuery,
    r.translated_kql,
    r.data?.kql,
    r.data?.query,
    r.data?.translatedQuery,
    r.data?.translated_kql,
  ]
  for (const v of values) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim()
  }
  return null
}

async function readJsonOrText(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { query: text }
  }
}

/**
 * Translate a natural-language query to KQL using Cribl AI.
 */
export async function translateEnglishToKql(englishQuery: string): Promise<string> {
  const prompt = englishQuery.trim()
  if (!prompt) throw new Error('English query cannot be empty.')

  const host = resolveCriblAiHost()
  const ac = new AbortController()
  const timer = globalThis.setTimeout(() => ac.abort(), AI_TRANSLATE_TIMEOUT_MS)

  let lastErr: string | null = null
  try {
    for (const path of AI_TRANSLATE_PATHS) {
      const url = `https://${host}${path}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: prompt,
          query: prompt,
          language: 'english',
          output: 'kql',
          target: 'kql',
        }),
        signal: ac.signal,
      })

      if (!res.ok) {
        // Path probing: try next candidate when endpoint is missing.
        if (res.status === 404) {
          lastErr = `Endpoint not found (${url})`
          continue
        }
        const body = await res.text().catch(() => '')
        throw new Error(`AI translation failed (${res.status}): ${body || res.statusText}`)
      }

      const payload = await readJsonOrText(res)
      const kql = pickTranslatedKql(payload)
      if (!kql) {
        throw new Error('AI translation response did not include KQL text.')
      }
      return kql
    }
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`AI translation timed out after ${Math.round(AI_TRANSLATE_TIMEOUT_MS / 1000)}s.`)
    }
    throw e
  } finally {
    globalThis.clearTimeout(timer)
  }

  throw new Error(lastErr ?? `AI translation endpoint unavailable on ${host}.`)
}
