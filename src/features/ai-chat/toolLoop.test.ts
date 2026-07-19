import { describe, expect, it, vi } from 'vitest'
import type { AgentToolCall, AiAgentChatService } from '@ports/AiAgentChatService'
import { AI_CHAT_MAX_TOOL_ROUNDS } from '@features/ai-chat/agentNdjson'
import { NOTEBOOK_CELL_TOOLS } from '@features/ai-chat/tools'
import { runChatToolLoop } from '@features/ai-chat/toolLoop'

function toolCall(name: string, args = '{}'): AgentToolCall {
  return { id: `call_${name}`, function: { name, arguments: args } }
}

function mockChat(turns: Awaited<ReturnType<AiAgentChatService['runAgentTurn']>>[]): AiAgentChatService {
  let i = 0
  return {
    isAvailable: () => true,
    runAgentTurn: vi.fn(async () => {
      const turn = turns[i] ?? turns[turns.length - 1]!
      i += 1
      return turn
    }),
  }
}

describe('runChatToolLoop', () => {
  it('executes injected tools then finishes on a text turn', async () => {
    const executeTool = vi.fn((_call: AgentToolCall) =>
      JSON.stringify({ ok: true, cellId: 'c1' }),
    )
    const chat = mockChat([
      {
        assistantText: '',
        toolCalls: [toolCall('create_markdown_cell', JSON.stringify({ source: '# Hi' }))],
        assistantMessage: {
          id: 'a1',
          role: 'assistant',
          content: '',
          reqId: 0,
          tool_calls: [toolCall('create_markdown_cell', JSON.stringify({ source: '# Hi' }))],
        },
      },
      {
        assistantText: 'Created an intro cell.',
        toolCalls: [],
        assistantMessage: { id: 'a2', role: 'assistant', content: '', reqId: 1 },
      },
    ])

    const result = await runChatToolLoop({
      chat,
      sessionId: 's1',
      priorApiMessages: [],
      userText: 'Make a short notebook',
      tools: NOTEBOOK_CELL_TOOLS,
      executeTool,
      summarizeTool: () => 'Created markdown cell',
    })

    expect(result.assistantText).toContain('Created an intro')
    expect(result.uiToolEvents).toEqual([{ summary: 'Created markdown cell', ok: true }])
    expect(chat.runAgentTurn).toHaveBeenCalledTimes(2)
    expect(executeTool).toHaveBeenCalledTimes(1)
  })

  it('stops after the maximum number of tool rounds', async () => {
    const executeTool = vi.fn(() => JSON.stringify({ ok: true }))
    const toolTurn = {
      assistantText: '',
      toolCalls: [toolCall('create_python_cell', '{"source":"x=1"}')],
      assistantMessage: {
        id: 'a',
        role: 'assistant' as const,
        content: '',
        reqId: 0,
        tool_calls: [toolCall('create_python_cell', '{"source":"x=1"}')],
      },
    }
    const chat = mockChat(Array.from({ length: AI_CHAT_MAX_TOOL_ROUNDS }, () => toolTurn))

    const result = await runChatToolLoop({
      chat,
      sessionId: 's1',
      priorApiMessages: [],
      userText: 'keep going',
      tools: NOTEBOOK_CELL_TOOLS,
      executeTool,
    })

    expect(chat.runAgentTurn).toHaveBeenCalledTimes(AI_CHAT_MAX_TOOL_ROUNDS)
    expect(executeTool).toHaveBeenCalledTimes(AI_CHAT_MAX_TOOL_ROUNDS)
    expect(result.assistantText).toMatch(/maximum number of tool rounds/i)
    expect(result.uiToolEvents).toHaveLength(AI_CHAT_MAX_TOOL_ROUNDS)
  })

  it('throws AbortError when signal is aborted before a round', async () => {
    const ac = new AbortController()
    ac.abort()
    const chat = mockChat([])

    await expect(
      runChatToolLoop({
        chat,
        sessionId: 's1',
        priorApiMessages: [],
        userText: 'hi',
        tools: NOTEBOOK_CELL_TOOLS,
        executeTool: () => JSON.stringify({ ok: true }),
        signal: ac.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })

    expect(chat.runAgentTurn).not.toHaveBeenCalled()
  })
})
