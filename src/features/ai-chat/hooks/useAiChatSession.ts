import { useCallback, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { useAiChatService } from '@app/providers'
import { newAgentMessageId } from '@features/ai-chat/agentNdjson'
import {
  executeNotebookTool,
  syncWorkspaceDispatch,
  toolCallSummary,
} from '@features/ai-chat/notebookCellTools'
import { runChatToolLoop, type ChatUiMessage } from '@features/ai-chat/toolLoop'
import { AI_CHAT_SYSTEM_PREAMBLE, NOTEBOOK_CELL_TOOLS } from '@features/ai-chat/tools'
import type { AgentChatMessage } from '@ports/AiAgentChatService'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'

function seedApiMessages(): AgentChatMessage[] {
  return [
    {
      id: newAgentMessageId(),
      role: 'user',
      content: AI_CHAT_SYSTEM_PREAMBLE,
      reqId: 0,
    },
    {
      id: newAgentMessageId(),
      role: 'assistant',
      content: 'Ready. Tell me what notebook to build and I will create cells with tools.',
      reqId: 1,
    },
  ]
}

const WELCOME_UI: ChatUiMessage = {
  id: 'welcome',
  kind: 'assistant',
  content:
    'Describe the notebook you want. I can add markdown, Python, %%cribl_search, %%cribl_api, and lookup magic cells into the open notebook (or create one).',
}

export type UseAiChatSessionArgs = {
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
}

export function useAiChatSession({ workspaceRef, dispatch }: UseAiChatSessionArgs) {
  const chat = useAiChatService()
  const available = chat.isAvailable()
  const [sessionId] = useState(() => newAgentMessageId())
  const apiMessagesRef = useRef<AgentChatMessage[]>(seedApiMessages())
  const [uiMessages, setUiMessages] = useState<ChatUiMessage[]>([WELCOME_UI])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    setStreaming('')
  }, [])

  const clearChat = useCallback(() => {
    if (busy) stop()
    apiMessagesRef.current = seedApiMessages()
    setUiMessages([
      {
        id: newAgentMessageId(),
        kind: 'assistant',
        content: 'Chat cleared. What should we build next?',
      },
    ])
    setDraft('')
    setStreaming('')
  }, [busy, stop])

  const send = useCallback(async () => {
    const text = draft.trim()
    if (!text || busy || !available) return
    setDraft('')
    const userId = newAgentMessageId()
    setUiMessages((prev) => [...prev, { id: userId, kind: 'user', content: text }])
    setBusy(true)
    setStreaming('')
    const ac = new AbortController()
    abortRef.current = ac

    const syncedDispatch = syncWorkspaceDispatch(workspaceRef, dispatch)
    const toolHost = { workspaceRef, dispatch: syncedDispatch }

    try {
      const result = await runChatToolLoop({
        chat,
        sessionId,
        priorApiMessages: apiMessagesRef.current,
        userText: text,
        tools: NOTEBOOK_CELL_TOOLS,
        executeTool: (call) => executeNotebookTool(toolHost, call),
        summarizeTool: toolCallSummary,
        signal: ac.signal,
        callbacks: {
          onAssistantDelta: (t) => setStreaming(t),
          onToolResult: (summary, ok) => {
            setUiMessages((prev) => [
              ...prev,
              { id: newAgentMessageId(), kind: 'tool', summary, ok },
            ])
          },
        },
      })
      apiMessagesRef.current = result.apiMessages
      if (result.assistantText.trim()) {
        setUiMessages((prev) => [
          ...prev,
          { id: newAgentMessageId(), kind: 'assistant', content: result.assistantText.trim() },
        ])
      } else if (result.uiToolEvents.length > 0) {
        setUiMessages((prev) => [
          ...prev,
          {
            id: newAgentMessageId(),
            kind: 'assistant',
            content: 'Done — new cells are in the notebook.',
          },
        ])
      }
    } catch (e) {
      const name =
        typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : ''
      if (name === 'AbortError') {
        setUiMessages((prev) => [
          ...prev,
          { id: newAgentMessageId(), kind: 'error', content: 'Generation stopped.' },
        ])
      } else {
        const msg = e instanceof Error ? e.message : String(e)
        setUiMessages((prev) => [...prev, { id: newAgentMessageId(), kind: 'error', content: msg }])
      }
    } finally {
      abortRef.current = null
      setBusy(false)
      setStreaming('')
    }
  }, [available, busy, chat, dispatch, draft, sessionId, workspaceRef])

  return {
    available,
    uiMessages,
    draft,
    setDraft,
    busy,
    streaming,
    send,
    clearChat,
    stop,
  }
}
