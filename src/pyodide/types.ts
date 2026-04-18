export type WorkerInbound = {
  type: 'exec'
  id: string
  code: string
}

export type WorkerOutbound =
  | { type: 'ready' }
  | { type: 'result'; id: string; value: string }
  | { type: 'error'; id: string; message: string }

export type KernelResult = { value: string } | { error: string }
