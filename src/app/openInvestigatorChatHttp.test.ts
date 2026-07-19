import { afterEach, describe, expect, it, vi } from 'vitest'
import { OPEN_INVESTIGATOR_AGENT_PATH } from '@/domain/openInvestigatorAgent'
import { postOpenInvestigatorTurn } from '@app/openInvestigatorChatHttp'

describe('postOpenInvestigatorTurn', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('POSTs to open_investigator and returns parsed text + tool_calls', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        [
          '{"name":"agent:open_investigator","role":"assistant","content":"Hi"}',
          '{"name":"agent:open_investigator","role":"assistant","content":"","tool_calls":[{"id":"t1","function":{"name":"create_markdown_cell","arguments":"{\\"source\\":\\"# x\\"}"}}]}',
        ].join('\n'),
        { status: 200 },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await postOpenInvestigatorTurn({
      apiBase: '/api/v1',
      sessionId: 's1',
      messages: [{ id: 'u1', role: 'user', content: 'hi', reqId: 0 }],
      tools: [],
    })

    expect(String(fetchMock.mock.calls[0]?.[0])).toContain(`/api/v1${OPEN_INVESTIGATOR_AGENT_PATH}`)
    expect(result.assistantText).toBe('Hi')
    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.function.name).toBe('create_markdown_cell')
  })

  it('maps not-registered agent errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ reason: 'Agent open_investigator is not registered' }), {
          status: 500,
          statusText: 'Error',
        }),
      ),
    )

    await expect(
      postOpenInvestigatorTurn({
        apiBase: '/api/v1',
        sessionId: 's1',
        messages: [],
        tools: [],
      }),
    ).rejects.toThrow(/registered open_investigator/)
  })
})
