import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage, OutputRecord } from '@platform/pyodide/types'
import {
  JINJA_RESULT_KEY_CRIBL_API,
  JINJA_RESULT_KEY_CRIBL_SEARCH,
  type NotebookJinjaInKernelResult,
  buildNotebookJinjaRenderCode,
  extractRenderedTextFromOutputs,
  runNotebookJinjaInKernel,
  shouldSuppressJinjaPreExecuteIOPub,
} from '@features/notebook/jinjaInKernel'

export { JINJA_RESULT_KEY_CRIBL_API, JINJA_RESULT_KEY_CRIBL_SEARCH } from '@features/notebook/jinjaInKernel'
export { buildNotebookJinjaRenderCode, runNotebookJinjaInKernel, extractRenderedTextFromOutputs } from '@features/notebook/jinjaInKernel'

/**
 * @deprecated use {@link shouldSuppressJinjaPreExecuteIOPub}
 */
export function shouldSuppressCriblSearchJinjaRenderIOPub(msg: IOPubMessage): boolean {
  return shouldSuppressJinjaPreExecuteIOPub(msg)
}

export function extractCriblSearchRenderedQueryFromOutputs(
  outputs: readonly OutputRecord[],
): string | null {
  return extractRenderedTextFromOutputs(outputs, JINJA_RESULT_KEY_CRIBL_SEARCH)
}

export function buildCriblSearchJinjaRenderCode(text: string): string {
  return buildNotebookJinjaRenderCode(text, JINJA_RESULT_KEY_CRIBL_SEARCH)
}

export type CriblSearchJinjaInKernelResult = NotebookJinjaInKernelResult

/**
 * Renders a `%%cribl_search` body (KQL) with Jinja2 in the kernel.
 */
export async function runCriblSearchJinjaInKernel(
  kernel: KernelPort,
  query: string,
  options: {
    executionCount: number
    emitIOPub: (msg: IOPubMessage) => void
    filterPyodidePackageChatter: (text: string) => string
  },
): Promise<NotebookJinjaInKernelResult> {
  return runNotebookJinjaInKernel(kernel, query, { ...options, resultKey: JINJA_RESULT_KEY_CRIBL_SEARCH })
}

/**
 * Renders a `%%cribl_api` YAML block with Jinja2 in the kernel.
 */
export async function runCriblApiJinjaInKernel(
  kernel: KernelPort,
  yamlBlock: string,
  options: {
    executionCount: number
    emitIOPub: (msg: IOPubMessage) => void
    filterPyodidePackageChatter: (text: string) => string
  },
): Promise<NotebookJinjaInKernelResult> {
  return runNotebookJinjaInKernel(kernel, yamlBlock, { ...options, resultKey: JINJA_RESULT_KEY_CRIBL_API })
}
