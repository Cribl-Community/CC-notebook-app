import { useEffect, useRef } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import { Button, Text } from '@capra/core'
import { useAiChatSession } from '@features/ai-chat/hooks/useAiChatSession'
import type { WorkspaceAction, WorkspaceState } from '@features/notebook/reducer/tabWorkspace'

export type AiChatTabProps = {
  /** Title of the notebook currently receiving cells, if a notebook tab is active. */
  targetNotebookTitle: string | null
  workspaceRef: MutableRefObject<WorkspaceState>
  dispatch: Dispatch<WorkspaceAction>
}

export function AiChatTab({ targetNotebookTitle, workspaceRef, dispatch }: AiChatTabProps) {
  const {
    available,
    uiMessages,
    draft,
    setDraft,
    busy,
    streaming,
    send,
    clearChat,
    stop,
  } = useAiChatSession({ workspaceRef, dispatch })
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [uiMessages, streaming, busy])

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
            {targetNotebookTitle
              ? `Editing: ${targetNotebookTitle}`
              : 'No notebook open — first cell creates one.'}
          </Text>
        </div>
        <div className="nb-ai-chat-header-actions">
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
          placeholder="e.g. Search cribl_search_sample and plot top IPs"
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
