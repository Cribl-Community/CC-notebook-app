/**
 * Abstracts a Python execution kernel so the notebook feature has no direct
 * knowledge of Pyodide, Web Workers, or any specific runtime. Adapters live
 * under `src/platform/pyodide`.
 */
import type { CompletionItem, IOPubMessage, KernelResult } from '@platform/pyodide/types'

export type { CompletionItem, IOPubMessage, KernelResult }

export interface KernelPort {
  /** Resolves when the kernel is ready to accept `execute` / `complete` calls. */
  readonly ready: Promise<void>
  execute(
    code: string,
    onIOPub?: (msg: IOPubMessage) => void,
    executionCount?: number,
  ): Promise<KernelResult>
  complete(code: string, cursor: number): Promise<CompletionItem[]>
  dispose(): void
}

export type KernelFactory = () => KernelPort
