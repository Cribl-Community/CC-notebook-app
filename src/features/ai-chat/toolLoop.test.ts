import { describe, expect, it, vi } from 'vitest'
import type { AiAgentChatService } from '@ports/AiAgentChatService'
import {
  createChatTab,
  createInitialWorkspace,
  tabWorkspaceReducer,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import { NOTEBOOK_CELL_TOOLS } from '@features/ai-chat/tools'
import { runChatToolLoop } from '@features/ai-chat/toolLoop'
import { syncWorkspaceDispatch } from '@features/ai-chat/notebookCellTools'

describe('runChatToolLoop', () => {
  it('executes tool_calls then finishes on a text turn', async () => {
    let state: WorkspaceState = createInitialWorkspace()
    const chatTab = createChatTab()
    state = tabWorkspaceReducer(state, { type: 'ADD_TAB', tab: chatTab })
    const workspaceRef = { current: state }
    const dispatch = syncWorkspaceDispatch(workspaceRef, (action) => {
      state = tabWorkspaceReducer(state, action)
      workspaceRef.current = state
    })

    let turn = 0
    const chat: AiAgentChatService = {
      isAvailable: () => true,
      runAgentTurn: vi.fn(async () => {
        turn += 1
        if (turn === 1) {
          return {
            assistantText: '',
            toolCalls: [
              {
                id: 'call_md',
                function: {
                  name: 'create_markdown_cell',
                  arguments: JSON.stringify({ source: '# Hi' }),
                },
              },
            ],
            assistantMessage: {
              id: 'a1',
              role: 'assistant' as const,
              content: '',
              reqId: 0,
              tool_calls: [
                {
                  id: 'call_md',
                  function: {
                    name: 'create_markdown_cell',
                    arguments: JSON.stringify({ source: '# Hi' }),
                  },
                },
              ],
            },
          }
        }
        return {
          assistantText: 'Created an intro cell.',
          toolCalls: [],
          assistantMessage: { id: 'a2', role: 'assistant' as const, content: '', reqId: 1 },
        }
      }),
    }

    const result = await runChatToolLoop({
      chat,
      sessionId: 's1',
      priorApiMessages: [],
      userText: 'Make a short notebook',
      tools: NOTEBOOK_CELL_TOOLS,
      toolHost: { workspaceRef, dispatch, chatTabId: chatTab.id },
    })

    expect(result.assistantText).toContain('Created an intro')
    expect(result.uiToolEvents).toEqual([{ summary: 'Created markdown cell', ok: true }])
    expect(chat.runAgentTurn).toHaveBeenCalledTimes(2)
    const linked = workspaceRef.current.tabs.find((t) => t.id === chatTab.id)?.linkedNotebookTabId
    const nb = workspaceRef.current.tabs.find((t) => t.id === linked)
    expect(nb?.notebook.cells.some((c) => c.cell_type === 'markdown' && c.source.includes('# Hi'))).toBe(
      true,
    )
  })
})
