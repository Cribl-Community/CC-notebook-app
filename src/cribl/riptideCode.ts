import { getCriblApiBase } from './kvstore'

export const AI_RIPTIDE_AGENT_PATH = '/ai/q/agents/riptide' as const
export const AI_RIPTIDE_TIMEOUT_MS = 28_000

function randomId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Concatenate streaming assistant fragments from an NDJSON Riptide response body.
 */
export function parseRiptideNdjsonBody(body: string): string {
  let acc = ''
  for (const line of body.split(/\r?\n/)) {
    const t = line.trim()
    if (!t) continue
    try {
      const row = JSON.parse(t) as Record<string, unknown>
      const c = row.content
      if (typeof c === 'string') acc += c
      const delta = row.delta
      if (delta && typeof delta === 'object' && delta !== null) {
        const d = delta as { content?: unknown }
        if (typeof d.content === 'string') acc += d.content
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return acc
}

/**
 * Prefer a fenced ```python block; otherwise return trimmed prose (plain code or mixed text).
 */
export function extractPythonFromRiptideText(raw: string): string {
  const t = raw.replace(/\\n/g, '\n').trim()
  if (!t) return ''
  const block = /```(?:python|py)\s*([\s\S]*?)```/i
  const m = t.match(block)
  if (m?.[1]) return m[1].trim()
  const anyFence = /```(?:[\w+-]*)\s*([\s\S]*?)```/
  const m2 = t.match(anyFence)
  if (m2?.[1]) return m2[1].trim()
  return t.replace(/^```[\w+-]*\s*/i, '').replace(/```\s*$/i, '').trim()
}

/**
 * Generate Python source from a natural-language description via the Riptide agent endpoint.
 * See `docs/riptide-api.md`.
 */
export async function generatePythonFromPrompt(
  userText: string,
  options?: { signal?: AbortSignal },
): Promise<string> {
  const prompt = userText.trim()
  if (!prompt) throw new Error('Description cannot be empty.')

  const base = getCriblApiBase() || '/api/v1'
  const url = `${base}${AI_RIPTIDE_AGENT_PATH}`
  const ac = new AbortController()
  const external = options?.signal
  const timer = globalThis.setTimeout(() => ac.abort(), AI_RIPTIDE_TIMEOUT_MS)

  const mergeExternalAbort = () => ac.abort()
  if (external) {
    if (external.aborted) ac.abort()
    else external.addEventListener('abort', mergeExternalAbort)
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ id: randomId(), role: 'user', content: prompt, reqId: 0 }],
        stream: true,
        sessionId: randomId(),
        context: {
          resources: {
            availableDatasets: [],
            availableLookups: [],
            externalSources: [],
          },
          files: {},
        },
        tools: [],
      }),
      signal: ac.signal,
    })

    const body = await res.text()
    if (!res.ok) {
      throw new Error(`Riptide request failed (${res.status}): ${body || res.statusText}`)
    }
    const text = parseRiptideNdjsonBody(body)
    const code = extractPythonFromRiptideText(text)
    if (!code) {
      throw new Error('Riptide did not return usable Python code.')
    }
    return code
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Riptide request timed out after ${Math.round(AI_RIPTIDE_TIMEOUT_MS / 1000)}s.`)
    }
    throw e
  } finally {
    globalThis.clearTimeout(timer)
    if (external) external.removeEventListener('abort', mergeExternalAbort)
  }
}
