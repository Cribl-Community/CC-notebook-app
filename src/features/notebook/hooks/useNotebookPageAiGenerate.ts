import { useCallback, useState } from 'react'
import type { Dispatch, MutableRefObject } from 'react'
import type { AiCodeService } from '@ports/AiCodeService'
import type { CellId, NotebookAction } from '@features/notebook/model/types'
import { filterPyodidePackageChatter } from '@features/cribl-search'
import { formatGeneratedPythonSource } from '@features/ai-riptide'
import { runRiptidePromptJinjaInKernel } from '@features/notebook/jinjaInKernel'
import { looksLikeJinjaTemplate } from '@features/notebook/jinjaTemplateHeuristic'
import type { WorkspaceState } from '@features/notebook/reducer/tabWorkspace'
import type { TabRuntimeController } from '@features/notebook/hooks/useTabNotebookRuntime'

export interface UseNotebookPageAiGenerateArgs {
  aiCode: AiCodeService
  showAlert: (message: string) => void
  dispatchNotebook: Dispatch<NotebookAction>
  runtime: TabRuntimeController
  activeTabIdRef: MutableRefObject<string>
  workspaceRef: MutableRefObject<WorkspaceState>
}

export function useNotebookPageAiGenerate(args: UseNotebookPageAiGenerateArgs) {
  const { aiCode, showAlert, dispatchNotebook, runtime, activeTabIdRef, workspaceRef } = args
  const [aiCodeBusyCellId, setAiCodeBusyCellId] = useState<CellId | null>(null)

  const handleAiGenerateFromPrompt = useCallback(
    async (cellId: CellId, prompt: string) => {
      if (!aiCode.isAvailable()) {
        showAlert(
          'Riptide code generation requires the app to run inside Cribl with AI APIs enabled. Local development mode has no API base URL.',
        )
        return
      }
      const trimmed = prompt.trim()
      if (!trimmed) return
      setAiCodeBusyCellId(cellId)
      try {
        let promptForApi = trimmed
        if (looksLikeJinjaTemplate(trimmed)) {
          const tid = activeTabIdRef.current
          const tab = workspaceRef.current.tabs.find((t) => t.id === tid)
          if (!tab || tab.kind === 'welcome') {
            showAlert('Open a notebook tab to use Jinja in the Riptide prompt.')
            return
          }
          const ks = tab.notebook.kernelStatus
          if (ks === 'loading' || ks === 'error') {
            showAlert(
              ks === 'loading'
                ? 'Wait for the Python kernel to finish loading before using Jinja in the prompt.'
                : 'The Python kernel is in an error state; fix or restart the kernel to use Jinja in the prompt.',
            )
            return
          }
          const kernel = runtime.kernelFor(tid)
          if (!kernel) {
            showAlert('Python kernel is not available. Wait until the kernel is ready and try again.')
            return
          }
          try {
            await kernel.ready
          } catch {
            showAlert('Python kernel failed to initialize.')
            return
          }
          const jinja = await runRiptidePromptJinjaInKernel(kernel, trimmed, {
            executionCount: 0,
            emitIOPub: () => {
              /* no cell IOPub for inline Jinja helper */
            },
            filterPyodidePackageChatter,
          })
          if (!jinja.ok) {
            showAlert(jinja.errorMessage)
            return
          }
          promptForApi = jinja.text
        }

        const code = await aiCode.generatePythonFromPrompt(promptForApi)
        const source = formatGeneratedPythonSource(trimmed, code)
        dispatchNotebook({ type: 'UPDATE_SOURCE', id: cellId, source })
      } catch (e) {
        showAlert(e instanceof Error ? e.message : 'Riptide request failed.')
      } finally {
        setAiCodeBusyCellId(null)
      }
    },
    [aiCode, showAlert, dispatchNotebook, runtime, activeTabIdRef, workspaceRef],
  )

  return { handleAiGenerateFromPrompt, aiCodeBusyCellId }
}
