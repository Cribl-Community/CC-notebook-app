export type CompletionKind = 'module' | 'class' | 'function' | 'instance'

export type CompletionItem = { name: string; kind: CompletionKind }

export type KernelMimeBundle = Record<string, string>

export type KernelMimeMetadata = Record<string, unknown>

export type KernelIOPubMessage =
  | { msg_type: 'stream'; name: 'stdout' | 'stderr'; text: string }
  | {
      msg_type: 'display_data'
      data: KernelMimeBundle
      metadata: KernelMimeMetadata
      transient?: { display_id?: string }
    }
  | {
      msg_type: 'execute_result'
      execution_count: number | null
      data: KernelMimeBundle
      metadata: KernelMimeMetadata
      transient?: { display_id?: string }
    }
  | {
      msg_type: 'update_display_data'
      data: KernelMimeBundle
      metadata: KernelMimeMetadata
      transient: { display_id: string }
    }
  | { msg_type: 'clear_output'; wait: boolean }
  | { msg_type: 'error'; ename: string; evalue: string; traceback: string[] }
  | { msg_type: 'status'; execution_state: 'busy' | 'idle' }

export type KernelOutputRecord =
  | {
      output_type: 'stream'
      name: 'stdout' | 'stderr'
      text: string
    }
  | {
      output_type: 'display_data'
      data: KernelMimeBundle
      metadata: KernelMimeMetadata
      display_id?: string
    }
  | {
      output_type: 'execute_result'
      execution_count: number | null
      data: KernelMimeBundle
      metadata: KernelMimeMetadata
      display_id?: string
    }
  | {
      output_type: 'error'
      ename: string
      evalue: string
      traceback: string[]
    }

export type KernelResult = { outputs: KernelOutputRecord[] }
