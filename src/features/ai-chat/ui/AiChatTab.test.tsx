import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AiChatProvider } from '@app/providers'
import type { AiAgentChatService } from '@ports/AiAgentChatService'
import {
  createEmptyTab,
  createInitialWorkspace,
  tabWorkspaceReducer,
  type WorkspaceState,
} from '@features/notebook/reducer/tabWorkspace'
import { AiChatTab } from '@features/ai-chat/ui/AiChatTab'

function wrap(service: AiAgentChatService, ui: ReactNode) {
  return <AiChatProvider value={service}>{ui}</AiChatProvider>
}

function workspaceHost() {
  let state: WorkspaceState = createInitialWorkspace()
  const nb = createEmptyTab()
  state = tabWorkspaceReducer(state, { type: 'ADD_TAB', tab: nb })
  const workspaceRef = { current: state }
  const dispatch = (action: Parameters<typeof tabWorkspaceReducer>[1]) => {
    state = tabWorkspaceReducer(state, action)
    workspaceRef.current = state
  }
  return { workspaceRef, dispatch, notebookTabId: nb.id }
}

describe('AiChatTab', () => {
  it('shows unavailable status when chat is not available', () => {
    const host = workspaceHost()
    const chat: AiAgentChatService = {
      isAvailable: () => false,
      runAgentTurn: vi.fn(),
    }
    render(
      wrap(
        chat,
        <AiChatTab
          targetNotebookTitle={null}
          workspaceRef={host.workspaceRef}
          dispatch={host.dispatch}
        />,
      ),
    )
    expect(screen.getByRole('status')).toHaveTextContent(/open_investigator/)
    expect(screen.getByLabelText('Chat message')).toBeDisabled()
  })

  it('sends a message and shows assistant + tool bubbles', async () => {
    const host = workspaceHost()
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
              role: 'assistant',
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
          assistantMessage: { id: 'a2', role: 'assistant', content: '', reqId: 1 },
        }
      }),
    }

    render(
      wrap(
        chat,
        <AiChatTab
          targetNotebookTitle="Demo"
          workspaceRef={host.workspaceRef}
          dispatch={host.dispatch}
        />,
      ),
    )

    expect(screen.getByText(/Editing: Demo/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Chat message'), {
      target: { value: 'Make a short notebook' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    await waitFor(() => {
      expect(screen.getByText('Make a short notebook')).toBeInTheDocument()
      expect(screen.getByText(/Created markdown cell/)).toBeInTheDocument()
      expect(screen.getByText('Created an intro cell.')).toBeInTheDocument()
    })
  })

  it('clears the chat transcript', async () => {
    const host = workspaceHost()
    const chat: AiAgentChatService = {
      isAvailable: () => true,
      runAgentTurn: vi.fn(async () => ({
        assistantText: 'Done.',
        toolCalls: [],
        assistantMessage: { id: 'a', role: 'assistant', content: '', reqId: 0 },
      })),
    }
    render(
      wrap(
        chat,
        <AiChatTab
          targetNotebookTitle={null}
          workspaceRef={host.workspaceRef}
          dispatch={host.dispatch}
        />,
      ),
    )

    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'hello' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByText('hello')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => {
      expect(screen.queryByText('hello')).not.toBeInTheDocument()
      expect(screen.getByText(/Chat cleared/)).toBeInTheDocument()
    })
  })

  it('stops an in-flight turn', async () => {
    const host = workspaceHost()
    let rejectTurn: ((reason?: unknown) => void) | null = null
    const chat: AiAgentChatService = {
      isAvailable: () => true,
      runAgentTurn: vi.fn(
        ({ signal }) =>
          new Promise((_resolve, reject) => {
            rejectTurn = reject
            const onAbort = () => {
              const err = new DOMException('Aborted', 'AbortError')
              reject(err)
            }
            if (signal?.aborted) onAbort()
            else signal?.addEventListener('abort', onAbort, { once: true })
          }),
      ),
    }

    render(
      wrap(
        chat,
        <AiChatTab
          targetNotebookTitle={null}
          workspaceRef={host.workspaceRef}
          dispatch={host.dispatch}
        />,
      ),
    )

    fireEvent.change(screen.getByLabelText('Chat message'), { target: { value: 'hang' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' })).not.toBeDisabled())
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))

    await waitFor(() => {
      expect(screen.getByText('Generation stopped.')).toBeInTheDocument()
    })
    expect(rejectTurn).toBeTruthy()
  })
})
