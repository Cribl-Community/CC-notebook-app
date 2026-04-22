import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AI_RIPTIDE_AGENT_PATH,
  DEFAULT_RIPTIDE_PROMPT_PREFIX,
  extractPythonFromRiptideText,
  formatGeneratedPythonSource,
  generatePythonFromPrompt,
  parseRiptideNdjsonBody,
  parseRiptidePromptFromCellSource,
  RIPTIDE_CELL_PROMPT_HEADER,
} from '@features/ai-riptide/riptideService'

describe('parseRiptideNdjsonBody', () => {
  it('concatenates assistant content lines', () => {
    const ndjson = ['{"name":"agent:riptide","role":"assistant","content":"x"}', '{"role":"assistant","content":"y"}'].join('\n')
    expect(parseRiptideNdjsonBody(ndjson)).toBe('xy')
  })

  it('accumulates delta.content fragments', () => {
    const ndjson = [JSON.stringify({ delta: { content: 'print(' } }), JSON.stringify({ delta: { content: '1)' } })].join('\n')
    expect(parseRiptideNdjsonBody(ndjson)).toBe('print(1)')
  })

  it('ignores invalid lines', () => {
    expect(parseRiptideNdjsonBody('not-json\n{"content":"ok"}\n')).toBe('ok')
  })
})

describe('formatGeneratedPythonSource', () => {
  it('writes ### Prompt header and comment lines, then code', () => {
    expect(formatGeneratedPythonSource('Hello', 'x = 1')).toBe(
      `# ${RIPTIDE_CELL_PROMPT_HEADER}\n# Hello\n\nx = 1\n`,
    )
    expect(formatGeneratedPythonSource('a\nb', 'print(1)')).toBe(
      `# ${RIPTIDE_CELL_PROMPT_HEADER}\n# a\n# b\n\nprint(1)\n`,
    )
  })

  it('exports default prefix for UI', () => {
    expect(DEFAULT_RIPTIDE_PROMPT_PREFIX).toBe('Generate Python code that ')
  })
})

describe('parseRiptidePromptFromCellSource', () => {
  it('returns null without ### Prompt pattern', () => {
    expect(parseRiptidePromptFromCellSource('x = 1')).toBeNull()
    expect(parseRiptidePromptFromCellSource('# foo\nx=1')).toBeNull()
  })

  it('parses header on its own line and following comment lines', () => {
    const src = `# ${RIPTIDE_CELL_PROMPT_HEADER}\n# Hello\n# world\n\nprint(1)\n`
    expect(parseRiptidePromptFromCellSource(src)).toBe('Hello\nworld')
  })

  it('parses text on same line as ### Prompt:', () => {
    const src = `# ${RIPTIDE_CELL_PROMPT_HEADER} one line\n\npass\n`
    expect(parseRiptidePromptFromCellSource(src)).toBe('one line')
  })

  it('round-trips with formatGeneratedPythonSource', () => {
    const prompt = `${DEFAULT_RIPTIDE_PROMPT_PREFIX}loads a CSV`
    const src = formatGeneratedPythonSource(prompt, 'import pandas as pd')
    expect(parseRiptidePromptFromCellSource(src)).toBe(prompt)
  })
})

describe('extractPythonFromRiptideText', () => {
  it('extracts from python fence', () => {
    expect(extractPythonFromRiptideText('```python\na = 1\n```')).toBe('a = 1')
  })

  it('uses generic fence when no python fence', () => {
    expect(extractPythonFromRiptideText('```\nprint(2)\n```')).toBe('print(2)')
  })

  it('returns trimmed text when no fence', () => {
    expect(extractPythonFromRiptideText('print(3)')).toBe('print(3)')
  })
})

describe('generatePythonFromPrompt', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns extracted code from NDJSON stream', async () => {
    const ndjson = [
      JSON.stringify({ name: 'agent:riptide', role: 'assistant', content: '```python\n' }),
      JSON.stringify({ role: 'assistant', content: 'x = 1\n' }),
      JSON.stringify({ role: 'assistant', content: '```' }),
    ].join('\n')
    const fetchMock = vi.fn().mockResolvedValue(new Response(ndjson, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(generatePythonFromPrompt('make a variable')).resolves.toBe('x = 1')
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/v1${AI_RIPTIDE_AGENT_PATH}`)
  })

  it('throws on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('bad', { status: 503 })))
    await expect(generatePythonFromPrompt('x')).rejects.toThrow(/Riptide request failed \(503\)/)
  })

  it('throws when no code in response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 })))
    await expect(generatePythonFromPrompt('x')).rejects.toThrow(/did not return usable Python/)
  })
})
