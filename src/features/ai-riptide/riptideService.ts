import { getCriblApiBase } from '@platform/cribl/kvstore'

export const AI_RIPTIDE_AGENT_PATH = '/ai/q/agents/riptide' as const
export const AI_RIPTIDE_TIMEOUT_MS = 28_000
export const AI_RIPTIDE_FIX_TIMEOUT_MS = 20_000

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

/** Default first words for the inline prompt so the model tends to emit Python. */
export const DEFAULT_RIPTIDE_PROMPT_PREFIX = 'Generate Python code that ' as const

/** Comment marker written into the cell before saved prompt lines (after `# `). */
export const RIPTIDE_CELL_PROMPT_HEADER = '### Prompt:' as const

/**
 * Prefix the cell with `# ### Prompt:` and each prompt line as `# …`, then the generated code.
 */
export function formatGeneratedPythonSource(userPrompt: string, generatedCode: string): string {
  const lines = userPrompt.trim().split('\n')
  const headerLine = `# ${RIPTIDE_CELL_PROMPT_HEADER}`
  const body = lines.map((line) => `# ${line}`).join('\n')
  const code = generatedCode.trim()
  return `${headerLine}\n${body}\n\n${code}\n`
}

/** True when the cell uses the saved Riptide `# ### Prompt:` comment block (see {@link formatGeneratedPythonSource}). */
export function isRiptidePromptCell(source: string): boolean {
  return parseRiptidePromptFromCellSource(source) !== null
}

/**
 * If the cell starts with the Riptide `### Prompt:` comment block, return the saved full prompt text.
 * Supports the format produced by {@link formatGeneratedPythonSource}. Otherwise returns `null`.
 */
export function parseRiptidePromptFromCellSource(source: string): string | null {
  const rawLines = source.replace(/\r\n/g, '\n').split('\n')
  let i = 0
  while (i < rawLines.length && (rawLines[i] ?? '').trim() === '') i++
  const first = rawLines[i] ?? ''
  const m0 = first.match(/^\s*#\s*###\s*Prompt:\s*(.*)$/)
  if (!m0) return null
  const firstRest = m0[1] ?? ''
  const parts: string[] = []
  if (firstRest.trim().length > 0) {
    parts.push(firstRest)
  }
  i++
  while (i < rawLines.length) {
    const line = rawLines[i] ?? ''
    if (line.trim() === '') break
    const cm = line.match(/^\s*#\s?(.*)$/)
    if (!cm) break
    parts.push(cm[1] ?? '')
    i++
  }
  if (parts.length === 0) return null
  return parts.join('\n').trim()
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

/**
 * Ask Riptide for a brief explanation and fix suggestion for a Python cell error.
 */
export async function suggestErrorFix(
  cellSource: string,
  ename: string,
  evalue: string,
  traceback: string[],
  options?: { signal?: AbortSignal },
): Promise<string> {
  const source = cellSource.trim()
  if (!source) throw new Error('Cell source cannot be empty.')
  const base = getCriblApiBase() || '/api/v1'
  const url = `${base}${AI_RIPTIDE_AGENT_PATH}`
  const ac = new AbortController()
  const external = options?.signal
  const timer = globalThis.setTimeout(() => ac.abort(), AI_RIPTIDE_FIX_TIMEOUT_MS)

  const mergeExternalAbort = () => ac.abort()
  if (external) {
    if (external.aborted) ac.abort()
    else external.addEventListener('abort', mergeExternalAbort)
  }

  const prompt = [
    'You are helping debug a Python notebook cell.',
    'Explain the likely cause and the fix in plain language.',
    'Use at most three short bullet points for prose.',
    'Whenever you show replacement Python, put each snippet in its own fenced Markdown block using ```python ... ``` so it can be copied or pasted into the cell.',
    'If the whole cell should be replaced, put the full replacement in a single ```python ... ``` block.',
    '',
    '## Cell code',
    '```python',
    source,
    '```',
    '',
    '## Error',
    `${ename}: ${evalue}`,
    '',
    '## Traceback',
    traceback.join('\n').trim(),
  ].join('\n')

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
    const text = parseRiptideNdjsonBody(body).trim()
    if (!text) {
      throw new Error('Riptide did not return a usable fix suggestion.')
    }
    return text
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(
        `Riptide fix suggestion timed out after ${Math.round(AI_RIPTIDE_FIX_TIMEOUT_MS / 1000)}s.`,
      )
    }
    throw e
  } finally {
    globalThis.clearTimeout(timer)
    if (external) external.removeEventListener('abort', mergeExternalAbort)
  }
}
