/**
 * Abstracts a Python execution kernel so the notebook feature has no direct
 * knowledge of Pyodide, Web Workers, or any specific runtime. Adapters live
 * under `src/platform/pyodide`.
 */
import type { CompletionItem, KernelIOPubMessage, KernelResult } from '@/domain/kernel'

export type { CompletionItem, KernelIOPubMessage as IOPubMessage, KernelResult }

export interface KernelPort {
  /** Resolves when the kernel is ready to accept `execute` / `complete` calls. */
  readonly ready: Promise<void>
  execute(
    code: string,
    onIOPub?: (msg: KernelIOPubMessage) => void,
    executionCount?: number,
  ): Promise<KernelResult>
  complete(code: string, cursor: number): Promise<CompletionItem[]>
  dispose(): void
}

export type KernelFactory = () => KernelPort
