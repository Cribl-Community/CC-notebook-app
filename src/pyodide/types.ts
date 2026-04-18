export type CompletionKind = 'module' | 'class' | 'function' | 'instance'

export type CompletionItem = { name: string; kind: CompletionKind }

export type WorkerInbound =
  | { type: 'init'; pyodideBaseUrl: string; pyodidePackageBaseUrl: string }
  | { type: 'exec'; id: string; code: string }
  | { type: 'complete'; id: string; code: string; cursor: number }

export type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'init_error'; message: string }
  | { type: 'result'; id: string; value: string }
  | { type: 'error'; id: string; ename: string; evalue: string; traceback: string[] }
  | { type: 'stream'; id: string; name: 'stdout' | 'stderr'; text: string }
  | { type: 'complete_result'; id: string; options: CompletionItem[] }

export type StreamOutput = { output_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
export type ExecuteResult = { output_type: 'execute_result'; data: string }
export type ErrorOutput = { output_type: 'error'; ename: string; evalue: string; traceback: string[] }
export type CellOutput = StreamOutput | ExecuteResult | ErrorOutput

export type KernelResult = { outputs: CellOutput[] }
