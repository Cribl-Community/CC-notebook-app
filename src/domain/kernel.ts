export type CompletionKind = 'module' | 'class' | 'function' | 'instance'

export type CompletionItem = { name: string; kind: CompletionKind }

export type KernelMimeBundle = Record<string, string>

export type KernelMimeMetadata = Record<string, unknown>

/** Public aliases — prefer these in notebook/UI code over `Kernel*` prefixes. */
export type MimeBundle = KernelMimeBundle
export type MimeMetadata = KernelMimeMetadata

/** Structured cell output records (nbformat / JupyterLab-style). */
export type StreamOutput = {
  output_type: 'stream'
  name: 'stdout' | 'stderr'
  text: string
}

export type DisplayDataOutput = {
  output_type: 'display_data'
  data: KernelMimeBundle
  metadata: KernelMimeMetadata
  display_id?: string
}

export type ExecuteResultOutput = {
  output_type: 'execute_result'
  execution_count: number | null
  data: KernelMimeBundle
  metadata: KernelMimeMetadata
  display_id?: string
}

export type ErrorOutput = {
  output_type: 'error'
  ename: string
  evalue: string
  traceback: string[]
}

export type KernelOutputRecord =
  | StreamOutput
  | DisplayDataOutput
  | ExecuteResultOutput
  | ErrorOutput

/** Alias matching historical notebook naming. */
export type OutputRecord = KernelOutputRecord
export type CellOutput = OutputRecord

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
  /**
   * Jupyter IOPub comm messages (kernel → client). Shapes mirror
   * `jupyter_client` / `@jupyterlab/services` `content` payloads.
   */
  | {
      msg_type: 'comm_open'
      channel?: 'iopub'
      content: {
        comm_id: string
        target_name: string
        data: Record<string, unknown>
      }
    }
  | {
      msg_type: 'comm_msg'
      channel?: 'iopub'
      content: { comm_id: string; data: Record<string, unknown> }
    }
  | {
      msg_type: 'comm_close'
      channel?: 'iopub'
      content: { comm_id: string; data?: Record<string, unknown> }
    }

export type IOPubMessage = KernelIOPubMessage

export function isCommIOPubMessage(
  msg: KernelIOPubMessage,
): msg is Extract<
  KernelIOPubMessage,
  { msg_type: 'comm_open' } | { msg_type: 'comm_msg' } | { msg_type: 'comm_close' }
> {
  return msg.msg_type === 'comm_open' || msg.msg_type === 'comm_msg' || msg.msg_type === 'comm_close'
}

export type KernelResult = { outputs: KernelOutputRecord[] }
