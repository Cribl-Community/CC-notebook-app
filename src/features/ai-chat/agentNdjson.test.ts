import { describe, expect, it } from 'vitest'
import { parseAgentNdjsonBody } from '@features/ai-chat/agentNdjson'

describe('parseAgentNdjsonBody', () => {
  it('concatenates assistant content fragments', () => {
    const body = [
      '{"name":"agent:open_investigator","role":"assistant","content":"Hel"}',
      '{"name":"agent:open_investigator","role":"assistant","content":"lo"}',
    ].join('\n')
    expect(parseAgentNdjsonBody(body)).toEqual({ assistantText: 'Hello', toolCalls: [] })
  })

  it('extracts tool_calls', () => {
    const body = JSON.stringify({
      name: 'agent:open_investigator',
      role: 'assistant',
      content: null,
      tool_calls: [
        {
          id: 'call_1',
          function: { name: 'create_python_cell', arguments: '{"source":"print(1)"}' },
        },
      ],
    })
    const parsed = parseAgentNdjsonBody(body)
    expect(parsed.assistantText).toBe('')
    expect(parsed.toolCalls).toEqual([
      {
        id: 'call_1',
        function: { name: 'create_python_cell', arguments: '{"source":"print(1)"}' },
      },
    ])
  })

  it('throws on reason-only error lines', () => {
    expect(() => parseAgentNdjsonBody('{"reason":"Agent boom"}')).toThrow(/boom/)
  })
})
