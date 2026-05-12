import { ManagerBase } from '@jupyter-widgets/base-manager'
import type { IClassicComm, WidgetModel, WidgetView } from '@jupyter-widgets/base'
import { PROTOCOL_VERSION } from '@jupyter-widgets/base'
import type { JSONObject } from '@lumino/coreutils'
import type { KernelMessage } from '@jupyterlab/services'
import type { KernelPort } from '@ports/KernelPort'
import type { IOPubMessage } from '@ports/KernelPort'
import { isCommIOPubMessage } from '@/domain/kernel'

const NOTEBOOK_SESSION = 'notebook-app'

/**
 * Browser-side widget manager: bridges Jupyter-shaped IOPub comm traffic to
 * `@jupyter-widgets/*` models/views, and forwards outbound `comm_msg` to the
 * Pyodide kernel via {@link KernelPort.postComm}.
 */
export class NotebookWidgetManager extends ManagerBase {
  private readonly kernel: KernelPort
  private readonly openComms = new Map<string, KernelOpenedComm>()

  constructor(kernel: KernelPort) {
    super()
    this.kernel = kernel
  }

  disconnect(): void {
    this.openComms.clear()
    super.disconnect()
  }

  /** Handle IOPub comm messages emitted by the Python kernel. */
  handleKernelIOPub(msg: IOPubMessage): void {
    if (!isCommIOPubMessage(msg)) return
    if (msg.msg_type === 'comm_open') {
      void this.onKernelCommOpen(msg)
      return
    }
    if (msg.msg_type === 'comm_msg') {
      const comm = this.openComms.get(msg.content.comm_id)
      comm?.dispatchKernelMsg(msg.content.data)
      return
    }
    if (msg.msg_type === 'comm_close') {
      this.openComms.delete(msg.content.comm_id)
    }
  }

  private async onKernelCommOpen(
    msg: Extract<IOPubMessage, { msg_type: 'comm_open' }>,
  ): Promise<void> {
    if (msg.content.target_name !== this.comm_target_name) {
      return
    }
    const content = msg.content as KernelMessage.ICommOpenMsg<'iopub'>['content']
    const jmsg = {
      channel: 'iopub' as const,
      header: {
        msg_id: crypto.randomUUID(),
        session: NOTEBOOK_SESSION,
        username: 'notebook-app',
        version: '5.3',
        date: new Date().toISOString(),
        msg_type: 'comm_open' as const,
      },
      metadata: { version: PROTOCOL_VERSION },
      parent_header: {} as KernelMessage.IHeader,
      content,
    } as KernelMessage.ICommOpenMsg<'iopub'>
    const comm = new KernelOpenedComm(this.kernel, msg.content.comm_id, msg.content.target_name)
    this.openComms.set(comm.comm_id, comm)
    try {
      await this.handle_comm_open(comm, jmsg)
    } catch (e) {
      console.error('[NotebookWidgetManager] handle_comm_open failed', e)
      this.openComms.delete(comm.comm_id)
    }
  }

  protected async loadClass(
    className: string,
    moduleName: string,
    moduleVersion: string,
  ): Promise<typeof WidgetModel | typeof WidgetView> {
    void moduleVersion
    if (moduleName === '@jupyter-widgets/controls') {
      const mod = await import('@jupyter-widgets/controls')
      const ctor = (mod as unknown as Record<string, unknown>)[className]
      if (typeof ctor !== 'function') {
        throw new Error(`Unknown class ${className} in ${moduleName}`)
      }
      return ctor as typeof WidgetModel
    }
    if (moduleName === '@jupyter-widgets/base') {
      const mod = await import('@jupyter-widgets/base')
      const ctor = (mod as unknown as Record<string, unknown>)[className]
      if (typeof ctor !== 'function') {
        throw new Error(`Unknown class ${className} in ${moduleName}`)
      }
      return ctor as typeof WidgetModel
    }
    throw new Error(`Unsupported widget module ${moduleName}`)
  }

  protected _create_comm(
    target_name: string,
    model_id?: string,
    data?: JSONObject,
    metadata?: JSONObject,
    buffers?: ArrayBuffer[] | ArrayBufferView[],
  ): Promise<IClassicComm> {
    void data
    void metadata
    void buffers
    const id = model_id ?? crypto.randomUUID().replace(/-/g, '')
    const comm = new KernelOpenedComm(this.kernel, id, target_name)
    this.openComms.set(id, comm)
    return Promise.resolve(comm)
  }

  protected _get_comm_info(): Promise<Record<string, never>> {
    return Promise.resolve({})
  }
}

class KernelOpenedComm implements IClassicComm {
  readonly comm_id: string
  readonly target_name: string
  private readonly kernel: KernelPort
  private msgHandlers: ((x: unknown) => void)[] = []
  private closeHandlers: ((x: unknown) => void)[] = []

  constructor(kernel: KernelPort, comm_id: string, target_name: string) {
    this.kernel = kernel
    this.comm_id = comm_id
    this.target_name = target_name
  }

  dispatchKernelMsg(data: Record<string, unknown>): void {
    for (const h of this.msgHandlers) {
      try {
        h(data)
      } catch {
        /* best-effort */
      }
    }
  }

  open(
    data?: unknown,
    callbacks?: unknown,
    metadata?: unknown,
    buffers?: ArrayBuffer[] | ArrayBufferView[],
  ): string {
    void data
    void callbacks
    void metadata
    void buffers
    return ''
  }

  send(
    data?: unknown,
    callbacks?: unknown,
    metadata?: unknown,
    buffers?: ArrayBuffer[] | ArrayBufferView[],
  ): string {
    void callbacks
    void metadata
    void buffers
    if (data !== undefined && typeof data === 'object' && data !== null) {
      this.kernel.postComm?.(this.comm_id, data as Record<string, unknown>)
    }
    return ''
  }

  close(
    data?: unknown,
    callbacks?: unknown,
    metadata?: unknown,
    buffers?: ArrayBuffer[] | ArrayBufferView[],
  ): string {
    void data
    void callbacks
    void metadata
    void buffers
    for (const h of this.closeHandlers) {
      try {
        h({})
      } catch {
        /* ignore */
      }
    }
    return ''
  }

  on_msg(callback: (x: unknown) => void): void {
    this.msgHandlers.push(callback)
  }

  on_close(callback: (x: unknown) => void): void {
    this.closeHandlers.push(callback)
  }
}
