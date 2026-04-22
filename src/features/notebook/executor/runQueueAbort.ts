/** Thrown to halt the per-tab run queue after a cell reports an error (queue is cleared first). */
export class RunQueueAbortedError extends Error {
  constructor() {
    super('Run queue aborted after cell error')
    this.name = 'RunQueueAbortedError'
  }
}
