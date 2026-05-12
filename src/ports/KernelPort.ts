/**
 * Abstracts a Python execution kernel so the notebook feature has no direct
 * knowledge of Pyodide, Web Workers, or any specific runtime. Adapters live
 * under `src/platform/pyodide`.
 */
import type {
  CellOutput,
  CompletionItem,
  KernelIOPubMessage,
  KernelResult,
  MimeBundle,
  MimeMetadata,
  OutputRecord,
} from '@/domain/kernel'

export type {
  CellOutput,
  CompletionItem,
  KernelIOPubMessage as IOPubMessage,
  KernelResult,
  MimeBundle,
  MimeMetadata,
  OutputRecord,
}

export interface KernelInitProgress {
  phase: 'boot' | 'worker' | 'runtime' | 'env' | 'bootstrap'
  message: string
  progressPercent: number | null
}

export interface KernelInitError {
  summary: string
  detail: string | null
}

export interface KernelPort {
  /** Resolves when the kernel is ready to accept `execute` / `complete` calls. */
  readonly ready: Promise<void>
  /**
   * Optional startup lifecycle notifications from kernel bootstrap.
   * The callback is best-effort and only used for UI progress updates.
   */
  setInitProgressListener?: (listener: ((progress: KernelInitProgress) => void) | null) => void
  /** Returns the most recent kernel init error, if startup failed. */
  getLastInitError?: () => KernelInitError | null
  execute(
    code: string,
    onIOPub?: (msg: KernelIOPubMessage) => void,
    executionCount?: number,
  ): Promise<KernelResult>
  complete(code: string, cursor: number): Promise<CompletionItem[]>
  /**
   * Request interruption of the current Python execution (KeyboardInterrupt).
   * Best-effort when the runtime supports it (Pyodide interrupt buffer); resolves when the signal is sent.
   */
  interrupt(): Promise<void>
  /**
   * Deliver a `comm_msg` from the client to the Python kernel (ipywidgets).
   * No-op for stubs that do not implement a comm bridge.
   */
  postComm?(commId: string, data: Record<string, unknown>): void
  dispose(): void
}

export type KernelFactory = () => KernelPort
