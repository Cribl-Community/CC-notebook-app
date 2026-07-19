import { useCallback, useEffect, useRef, useState } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { Button, Text } from '@capra/core'
import { useAiChatService } from '@app/providers'
import {
  AI_CHAT_SYSTEM_PREAMBLE,
  NOTEBOOK_CELL_TOOLS,
  newAgentMessageId,
  runChatToolLoop,
  syncWorkspaceDispatch,
  type ChatUiMessage,
} from '@features/ai-chat'
import type { AgentChatMessage } from '@ports/AiAgentChatService'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'

export type AiChatTabProps = {
  chatTabId: string
  linkedNotebookTabId: string | null
  linkedNotebookTitle: string | null
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
  onOpenLinkedNotebook: () => void
}

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

export function AiChatTab({
  chatTabId,
  linkedNotebookTabId,
  linkedNotebookTitle,
  workspaceRef,
  dispatch,
  onOpenLinkedNotebook,
}: AiChatTabProps) {
  const chat = useAiChatService()
  const available = chat.isAvailable()
  const [sessionId] = useState(() => newAgentMessageId())
  const apiMessagesRef = useRef<AgentChatMessage[]>(seedApiMessages())
  const [uiMessages, setUiMessages] = useState<ChatUiMessage[]>([
    {
      id: 'welcome',
      kind: 'assistant',
      content:
        'Describe the notebook you want. I can add markdown, Python, %%cribl_search, %%cribl_api, and lookup magic cells.',
    },
  ])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [streaming, setStreaming] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [uiMessages, streaming, busy])

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
    const toolHost = {
      workspaceRef,
      dispatch: syncedDispatch,
      chatTabId,
    }

    try {
      const result = await runChatToolLoop({
        chat,
        sessionId,
        priorApiMessages: apiMessagesRef.current,
        userText: text,
        tools: NOTEBOOK_CELL_TOOLS,
        toolHost,
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
            content: 'Done — check the linked notebook for new cells.',
          },
        ])
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
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
  }, [available, busy, chat, chatTabId, dispatch, draft, sessionId, workspaceRef])

  return (
    <div className="nb-ai-chat" data-testid="ai-chat-tab">
      <header className="nb-ai-chat-header">
        <div className="nb-ai-chat-header-text">
          <h2 className="nb-ai-chat-title">
            <Text as="span" variant="heading-sm">
              AI Chat
            </Text>
          </h2>
          <Text as="p" variant="body-sm-normal" color="subtle">
            {linkedNotebookTabId
              ? `Writing to notebook: ${linkedNotebookTitle ?? 'Untitled'}`
              : 'No linked notebook yet — cells will create one automatically.'}
          </Text>
        </div>
        <div className="nb-ai-chat-header-actions">
          <Button
            variant="secondary"
            size="sm"
            disabled={!linkedNotebookTabId}
            onClick={onOpenLinkedNotebook}
          >
            Open notebook
          </Button>
          <Button variant="secondary" size="sm" onClick={clearChat} disabled={busy}>
            Clear
          </Button>
          <Button variant="secondary" size="sm" onClick={stop} disabled={!busy}>
            Stop
          </Button>
        </div>
      </header>

      {!available && (
        <div className="nb-ai-chat-unavailable" role="status">
          <Text as="p" variant="body-sm-normal" color="subtle">
            AI chat needs a Cribl deployment with the open_investigator agent (not available in local
            dev without CRIBL_API_URL).
          </Text>
        </div>
      )}

      <div className="nb-ai-chat-messages" ref={listRef} role="log" aria-live="polite">
        {uiMessages.map((m) => (
          <div
            key={m.id}
            className={
              m.kind === 'user'
                ? 'nb-ai-chat-bubble nb-ai-chat-bubble--user'
                : m.kind === 'tool'
                  ? 'nb-ai-chat-bubble nb-ai-chat-bubble--tool'
                  : m.kind === 'error'
                    ? 'nb-ai-chat-bubble nb-ai-chat-bubble--error'
                    : 'nb-ai-chat-bubble nb-ai-chat-bubble--assistant'
            }
          >
            {m.kind === 'tool' ? (
              <Text as="span" variant="body-sm-normal">
                {m.ok ? '✓' : '✗'} {m.summary}
              </Text>
            ) : (
              <Text as="span" variant="body-md-normal">
                {m.content}
              </Text>
            )}
          </div>
        ))}
        {streaming ? (
          <div className="nb-ai-chat-bubble nb-ai-chat-bubble--assistant nb-ai-chat-bubble--streaming">
            <Text as="span" variant="body-md-normal">
              {streaming}
            </Text>
          </div>
        ) : null}
        {busy && !streaming ? (
          <div className="nb-ai-chat-bubble nb-ai-chat-bubble--assistant">
            <Text as="span" variant="body-sm-normal" color="subtle">
              Thinking…
            </Text>
          </div>
        ) : null}
      </div>

      <form
        className="nb-ai-chat-composer"
        onSubmit={(e) => {
          e.preventDefault()
          void send()
        }}
      >
        <textarea
          className="nb-ai-chat-input"
          rows={3}
          value={draft}
          disabled={!available || busy}
          placeholder="e.g. Build a notebook that searches cribl_search_sample and plots top srcaddr by bytes"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          aria-label="Chat message"
        />
        <Button type="submit" variant="primary" disabled={!available || busy || !draft.trim()}>
          Send
        </Button>
      </form>
    </div>
  )
}
