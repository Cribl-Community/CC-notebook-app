/**
 * Pure, immutable application of Jupyter IOPub messages to an output area.
 *
 * Mirrors the semantics of `@jupyterlab/outputarea`'s `OutputAreaModel`:
 *   - Adjacent stream chunks (same name) are merged into a trailing record. When
 *     neither the previous text nor the incoming text provides a line boundary
 *     (trailing/leading `\\n`), a newline is inserted so multiple `print()` calls
 *     still match line-oriented terminal behavior (Pyodide may split stdout
 *     without per-print newlines in batch callbacks).
 *   - `display_id` enables `update_display_data` to replace `data`/`metadata`
 *     of every record sharing that id.
 *   - `clear_output { wait: false }` clears immediately.
 *   - `clear_output { wait: true }` defers the clear to just before the next
 *     non-status message is appended (so the UI does not flicker).
 *   - `status: idle` is treated as the end-of-output marker by the *caller*;
 *     this function is a no-op for it.
 *
 * The output area state is represented as a pair: the current record list and
 * a `pendingClear` flag. Helpers below produce a fresh state object every time
 * to make this safe to use inside a React reducer.
 */

import type { IOPubMessage, MimeMetadata, OutputRecord } from '@platform/pyodide/types'

export interface OutputAreaState {
  records: OutputRecord[]
  /** Set by `clear_output { wait: true }`; consumed on the next non-status msg. */
  pendingClear: boolean
}

export function createOutputArea(): OutputAreaState {
  return { records: [], pendingClear: false }
}

export function clearOutputArea(): OutputAreaState {
  return { records: [], pendingClear: false }
}

function maybeFlushPendingClear(state: OutputAreaState): OutputAreaState {
  if (!state.pendingClear) return state
  return { records: [], pendingClear: false }
}

/** Join two stream fragments; add `\\n` when the bridge omits a line break between writes. */
function mergeStreamText(previous: string, incoming: string): string {
  if (previous.length === 0) return incoming
  if (incoming.length === 0) return previous
  const hasBoundary = previous.endsWith('\n') || incoming.startsWith('\n')
  if (hasBoundary) return previous + incoming
  return `${previous}\n${incoming}`
}

function appendStream(
  records: OutputRecord[],
  name: 'stdout' | 'stderr',
  text: string,
): OutputRecord[] {
  if (text.length === 0) return records
  const last = records[records.length - 1]
  if (last && last.output_type === 'stream' && last.name === name) {
    const next = records.slice(0, -1)
    next.push({ output_type: 'stream', name, text: mergeStreamText(last.text, text) })
    return next
  }
  return [...records, { output_type: 'stream', name, text }]
}

function applyDisplayUpdate(
  records: OutputRecord[],
  display_id: string,
  data: Record<string, string>,
  metadata: MimeMetadata,
): OutputRecord[] {
  let changed = false
  const next = records.map((r) => {
    if (
      (r.output_type === 'display_data' || r.output_type === 'execute_result') &&
      r.display_id === display_id
    ) {
      changed = true
      return { ...r, data, metadata }
    }
    return r
  })
  return changed ? next : records
}

/**
 * Apply a single IOPub message to an output area, returning a new state.
 * Pure — never mutates the input.
 */
export function applyIOPub(state: OutputAreaState, msg: IOPubMessage): OutputAreaState {
  if (msg.msg_type === 'status') {
    return state
  }

  if (msg.msg_type === 'clear_output') {
    if (msg.wait) {
      return { records: state.records, pendingClear: true }
    }
    return { records: [], pendingClear: false }
  }

  if (msg.msg_type === 'update_display_data') {
    const id = msg.transient.display_id
    const flushed = maybeFlushPendingClear(state)
    return {
      records: applyDisplayUpdate(flushed.records, id, msg.data, msg.metadata),
      pendingClear: false,
    }
  }

  const flushed = maybeFlushPendingClear(state)

  if (msg.msg_type === 'stream') {
    return {
      records: appendStream(flushed.records, msg.name, msg.text),
      pendingClear: false,
    }
  }

  if (msg.msg_type === 'display_data') {
    const display_id = msg.transient?.display_id
    return {
      records: [
        ...flushed.records,
        {
          output_type: 'display_data',
          data: msg.data,
          metadata: msg.metadata,
          ...(display_id ? { display_id } : {}),
        },
      ],
      pendingClear: false,
    }
  }

  if (msg.msg_type === 'execute_result') {
    const display_id = msg.transient?.display_id
    return {
      records: [
        ...flushed.records,
        {
          output_type: 'execute_result',
          execution_count: msg.execution_count,
          data: msg.data,
          metadata: msg.metadata,
          ...(display_id ? { display_id } : {}),
        },
      ],
      pendingClear: false,
    }
  }

  if (msg.msg_type === 'error') {
    return {
      records: [
        ...flushed.records,
        {
          output_type: 'error',
          ename: msg.ename,
          evalue: msg.evalue,
          traceback: msg.traceback,
        },
      ],
      pendingClear: false,
    }
  }

  return state
}

/**
 * Convenience for the reducer path: apply an IOPub message to a flat record
 * list. The `pendingClear` semantics are encoded by tracking it on the trailing
 * record list — when `wait: true` is received we *do not* clear here; instead
 * the caller may pass the next message back through to trigger the deferred
 * clear. For the deferred-clear behavior to work, callers must use
 * {@link applyIOPub} with full {@link OutputAreaState} objects.
 */
export function applyIOPubToRecords(
  records: OutputRecord[],
  msg: IOPubMessage,
): OutputRecord[] {
  return applyIOPub({ records, pendingClear: false }, msg).records
}
