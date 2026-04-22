import { describe, it, expect } from 'vitest'
import { notebookReducer, initialState } from './notebookReducer'
import type { CodeCell, NotebookState } from '@features/notebook/model/types'

/**
 * Regression tests for `clear_output { wait: true }` semantics after the
 * WeakMap side-state was folded into the pure reducer. Deferred clears now
 * live on the CodeCell itself as `pendingClear`.
 */

function firstCodeCell(state: NotebookState): CodeCell {
  const c = state.cells[0]
  if (c.cell_type !== 'code') throw new Error('expected code cell')
  return c
}

describe('clear_output wait:true via pendingClear', () => {
  it('sets pendingClear without clearing outputs until next non-status message', () => {
    const cellId = firstCodeCell(initialState).id

    // Seed with stream output
    let s = notebookReducer(initialState, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'stream', name: 'stdout', text: 'hello' },
      executionCount: 1,
    })
    expect(firstCodeCell(s).outputs).toHaveLength(1)
    expect(firstCodeCell(s).pendingClear).toBeFalsy()

    // Request deferred clear — outputs remain, pendingClear set
    s = notebookReducer(s, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'clear_output', wait: true },
      executionCount: 1,
    })
    expect(firstCodeCell(s).outputs).toHaveLength(1)
    expect(firstCodeCell(s).pendingClear).toBe(true)

    // Next non-status message flushes the pending clear and then appends
    s = notebookReducer(s, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'stream', name: 'stdout', text: 'world' },
      executionCount: 1,
    })
    const c = firstCodeCell(s)
    expect(c.outputs).toHaveLength(1)
    expect(c.outputs[0]).toMatchObject({ output_type: 'stream', text: 'world' })
    expect(c.pendingClear).toBe(false)
  })

  it('status messages do not flush the pending clear', () => {
    const cellId = firstCodeCell(initialState).id
    let s = notebookReducer(initialState, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'stream', name: 'stdout', text: 'hello' },
      executionCount: 1,
    })
    s = notebookReducer(s, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'clear_output', wait: true },
      executionCount: 1,
    })
    s = notebookReducer(s, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'status', execution_state: 'idle' },
      executionCount: 1,
    })
    expect(firstCodeCell(s).outputs).toHaveLength(1)
    expect(firstCodeCell(s).pendingClear).toBe(true)
  })

  it('SET_RUNNING resets pendingClear', () => {
    const cellId = firstCodeCell(initialState).id
    let s = notebookReducer(initialState, {
      type: 'IOPUB',
      id: cellId,
      msg: { msg_type: 'clear_output', wait: true },
      executionCount: 1,
    })
    expect(firstCodeCell(s).pendingClear).toBe(true)
    s = notebookReducer(s, { type: 'SET_RUNNING', id: cellId })
    expect(firstCodeCell(s).pendingClear).toBe(false)
  })
})
