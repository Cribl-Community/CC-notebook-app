import { useEffect, useId, useRef, type RefObject } from 'react'

export type NotebookDialogProps = {
  open: boolean
  variant: 'alert' | 'confirm' | 'prompt'
  title?: string
  /** Body text (alert / confirm) or supplementary text for prompt */
  message: string
  promptLabel?: string
  promptValue: string
  /** Multi-line description input (Ctrl/Cmd+Enter to submit) */
  promptMultiline?: boolean
  onPromptValueChange: (v: string) => void
  primaryLabel?: string
  secondaryLabel?: string
  onPrimary: () => void
  onSecondary?: () => void
}

/** In-browser modal for staging environments that disallow `window.alert` / `confirm` / `prompt`. */
export function NotebookDialog({
  open,
  variant,
  title,
  message,
  promptLabel,
  promptValue,
  promptMultiline = false,
  onPromptValueChange,
  primaryLabel = 'OK',
  secondaryLabel = 'Cancel',
  onPrimary,
  onSecondary,
}: NotebookDialogProps) {
  const titleId = useId()
  const promptInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (variant === 'alert') onPrimary()
        else onSecondary?.()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, variant, onPrimary, onSecondary])

  useEffect(() => {
    if (open && variant === 'prompt') {
      const t = window.setTimeout(() => {
        const el = promptInputRef.current
        el?.focus()
        if (el instanceof HTMLInputElement) el.select()
      }, 0)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open, variant])

  if (!open) return null

  const showSecondary = variant !== 'alert'

  return (
    <div
      className="nb-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target !== e.currentTarget) return
        if (variant === 'alert') onPrimary()
        else onSecondary?.()
      }}
    >
      <div
        className="nb-dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        {title && (
          <h2 id={titleId} className="nb-dialog-title">
            {title}
          </h2>
        )}
        {variant !== 'prompt' && <p className="nb-dialog-message">{message}</p>}
        {variant === 'prompt' && (
          <>
            {message ? <p className="nb-dialog-message nb-dialog-message--muted">{message}</p> : null}
            <label className="nb-dialog-field">
              <span className="nb-dialog-label">{promptLabel}</span>
              {promptMultiline ? (
                <textarea
                  ref={promptInputRef as RefObject<HTMLTextAreaElement>}
                  className="nb-dialog-input nb-dialog-textarea"
                  value={promptValue}
                  rows={8}
                  onChange={(e) => onPromptValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      onPrimary()
                    }
                  }}
                />
              ) : (
                <input
                  ref={promptInputRef as RefObject<HTMLInputElement>}
                  type="text"
                  className="nb-dialog-input"
                  value={promptValue}
                  onChange={(e) => onPromptValueChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      onPrimary()
                    }
                  }}
                />
              )}
            </label>
          </>
        )}
        <div className="nb-dialog-actions">
          {showSecondary && (
            <button type="button" className="nb-btn nb-dialog-btn-secondary" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
          <button type="button" className="nb-btn nb-btn-primary nb-dialog-btn-primary" onClick={onPrimary}>
            {primaryLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
