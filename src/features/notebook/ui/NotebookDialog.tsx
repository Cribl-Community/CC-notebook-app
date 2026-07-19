import { useEffect, useRef } from 'react'
import { Button, Modal, TextField } from '@capra/core'

export type NotebookDialogProps = {
  open: boolean
  variant: 'alert' | 'confirm' | 'prompt'
  title?: string
  /** Body text (alert / confirm) or supplementary text for prompt */
  message: string
  promptLabel?: string
  promptValue: string
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
  onPromptValueChange,
  primaryLabel = 'OK',
  secondaryLabel = 'Cancel',
  onPrimary,
  onSecondary,
}: NotebookDialogProps) {
  const promptInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open && variant === 'prompt') {
      const t = window.setTimeout(() => {
        promptInputRef.current?.focus()
        promptInputRef.current?.select()
      }, 0)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [open, variant])

  const handleSecondary = () => {
    onSecondary?.()
  }

  const handleOpenChange = (next: boolean) => {
    if (next) return
    if (variant === 'alert') onPrimary()
    else handleSecondary()
  }

  const promptFooter = (
    <Modal.FooterActions>
      <Button variant="secondary" onClick={handleSecondary}>
        {secondaryLabel}
      </Button>
      <Button variant="primary" onClick={onPrimary}>
        {primaryLabel}
      </Button>
    </Modal.FooterActions>
  )

  return (
    <Modal
      isOpen={open}
      onIsOpenChange={handleOpenChange}
      title={title}
      size="sm"
      isDismissible={variant !== 'alert'}
      confirmButtonText={variant === 'prompt' ? undefined : primaryLabel}
      cancelButtonText={variant === 'alert' ? null : variant === 'prompt' ? null : secondaryLabel}
      onConfirm={variant === 'prompt' ? undefined : onPrimary}
      onClose={variant === 'alert' ? onPrimary : handleSecondary}
      footer={variant === 'prompt' ? promptFooter : undefined}
    >
      {variant !== 'prompt' && message ? <p className="nb-dialog-message">{message}</p> : null}
      {variant === 'prompt' && (
        <div className="nb-dialog-prompt">
          {message ? <p className="nb-dialog-message nb-dialog-message--muted">{message}</p> : null}
          <TextField
            ref={promptInputRef}
            label={promptLabel ?? 'Value'}
            value={promptValue}
            onChange={onPromptValueChange}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onPrimary()
              }
            }}
          />
        </div>
      )}
    </Modal>
  )
}
