/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import type { DialogService } from '@ports/DialogService'
import { NotebookDialog } from '@features/notebook/ui/NotebookDialog'

/**
 * Imperative dialog service (alert / confirm / prompt) backed by the shared
 * `NotebookDialog` component. Used by features that must block on user
 * confirmation (delete, overwrite, rename). Owning the dialog state in a
 * provider means individual consumers don't prop-drill callbacks.
 */

type DialogState =
  | { kind: 'alert'; message: string }
  | { kind: 'confirm'; message: string }
  | { kind: 'prompt'; title: string; label: string; defaultValue: string; input: string }

const DialogContext = createContext<DialogService | null>(null)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null)
  const confirmRef = useRef<((ok: boolean) => void) | null>(null)
  const promptRef = useRef<((value: string | null) => void) | null>(null)

  const alert = useCallback((message: string) => {
    setDialog({ kind: 'alert', message })
  }, [])

  const confirm = useCallback(
    (message: string): Promise<boolean> =>
      new Promise((resolve) => {
        confirmRef.current = (ok: boolean) => {
          confirmRef.current = null
          resolve(ok)
        }
        setDialog({ kind: 'confirm', message })
      }),
    [],
  )

  const prompt = useCallback(
    (title: string, label: string, defaultValue = ''): Promise<string | null> =>
      new Promise((resolve) => {
        promptRef.current = (value: string | null) => {
          promptRef.current = null
          resolve(value)
        }
        setDialog({ kind: 'prompt', title, label, defaultValue, input: defaultValue })
      }),
    [],
  )

  const service = useMemo<DialogService>(() => ({ alert, confirm, prompt }), [alert, confirm, prompt])

  const dismissAlert = useCallback(() => setDialog(null), [])
  const confirmOk = useCallback(() => {
    confirmRef.current?.(true)
    setDialog(null)
  }, [])
  const confirmCancel = useCallback(() => {
    confirmRef.current?.(false)
    setDialog(null)
  }, [])
  const promptSubmit = useCallback(() => {
    setDialog((d) => {
      if (d?.kind !== 'prompt') return d
      const fn = promptRef.current
      if (fn) {
        promptRef.current = null
        fn(d.input)
      }
      return null
    })
  }, [])
  const promptCancel = useCallback(() => {
    promptRef.current?.(null)
    setDialog(null)
  }, [])
  const promptChange = useCallback((input: string) => {
    setDialog((d) => (d?.kind === 'prompt' ? { ...d, input } : d))
  }, [])

  return (
    <DialogContext.Provider value={service}>
      {children}
      <NotebookDialog
        open={dialog?.kind === 'alert'}
        variant="alert"
        title="Notice"
        message={dialog?.kind === 'alert' ? dialog.message : ''}
        promptValue=""
        onPromptValueChange={() => {}}
        onPrimary={dismissAlert}
      />
      <NotebookDialog
        open={dialog?.kind === 'confirm'}
        variant="confirm"
        title="Confirm"
        message={dialog?.kind === 'confirm' ? dialog.message : ''}
        promptValue=""
        onPromptValueChange={() => {}}
        onPrimary={confirmOk}
        onSecondary={confirmCancel}
      />
      <NotebookDialog
        open={dialog?.kind === 'prompt'}
        variant="prompt"
        title={dialog?.kind === 'prompt' ? dialog.title : ''}
        message=""
        promptLabel={dialog?.kind === 'prompt' ? dialog.label : ''}
        promptValue={dialog?.kind === 'prompt' ? dialog.input : ''}
        onPromptValueChange={promptChange}
        onPrimary={promptSubmit}
        onSecondary={promptCancel}
      />
    </DialogContext.Provider>
  )
}

/** Access the ambient DialogService. Throws if not wrapped in DialogProvider. */
export function useDialogs(): DialogService {
  const ctx = useContext(DialogContext)
  if (!ctx) throw new Error('useDialogs must be used inside <DialogProvider>')
  return ctx
}
