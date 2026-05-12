import { describe, expect, it } from 'vitest'
import { applyIOPub, createOutputArea } from '@features/notebook/reducer/outputArea'
import type { IOPubMessage } from '@/domain/kernel'

function feed(msgs: IOPubMessage[]) {
  let s = createOutputArea()
  for (const m of msgs) s = applyIOPub(s, m)
  return s
}

describe('applyIOPub – stream merging', () => {
  it('merges consecutive same-name stream chunks (inserts newline when chunks lack boundary)', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'a' },
      { msg_type: 'stream', name: 'stdout', text: 'b' },
      { msg_type: 'stream', name: 'stdout', text: 'c' },
    ])
    expect(s.records).toEqual([{ output_type: 'stream', name: 'stdout', text: 'a\nb\nc' }])
  })

  it('does not insert extra newline when chunks already have line boundaries', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'a\n' },
      { msg_type: 'stream', name: 'stdout', text: 'b\n' },
    ])
    expect(s.records).toEqual([{ output_type: 'stream', name: 'stdout', text: 'a\nb\n' }])
  })

  it('does not merge stdout into stderr', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'out\n' },
      { msg_type: 'stream', name: 'stderr', text: 'err\n' },
      { msg_type: 'stream', name: 'stdout', text: 'out2' },
    ])
    expect(s.records).toEqual([
      { output_type: 'stream', name: 'stdout', text: 'out\n' },
      { output_type: 'stream', name: 'stderr', text: 'err\n' },
      { output_type: 'stream', name: 'stdout', text: 'out2' },
    ])
  })

  it('ignores empty stream payloads', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'a' },
      { msg_type: 'stream', name: 'stdout', text: '' },
      { msg_type: 'stream', name: 'stdout', text: 'b' },
    ])
    expect(s.records).toEqual([{ output_type: 'stream', name: 'stdout', text: 'a\nb' }])
  })

  it('does not merge across an intervening display_data', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'a' },
      {
        msg_type: 'display_data',
        data: { 'text/plain': 'x' },
        metadata: {},
      },
      { msg_type: 'stream', name: 'stdout', text: 'b' },
    ])
    expect(s.records.map((r) => r.output_type)).toEqual([
      'stream',
      'display_data',
      'stream',
    ])
  })
})

describe('applyIOPub – display_id and update_display_data', () => {
  it('records display_id when transient is provided', () => {
    const s = feed([
      {
        msg_type: 'display_data',
        data: { 'text/plain': 'hello' },
        metadata: {},
        transient: { display_id: 'd1' },
      },
    ])
    expect(s.records).toEqual([
      {
        output_type: 'display_data',
        data: { 'text/plain': 'hello' },
        metadata: {},
        display_id: 'd1',
      },
    ])
  })

  it('update_display_data replaces every record sharing the id', () => {
    const s = feed([
      {
        msg_type: 'display_data',
        data: { 'text/plain': 'first' },
        metadata: {},
        transient: { display_id: 'd1' },
      },
      { msg_type: 'stream', name: 'stdout', text: 'in between\n' },
      {
        msg_type: 'display_data',
        data: { 'text/plain': 'first-again' },
        metadata: {},
        transient: { display_id: 'd1' },
      },
      {
        msg_type: 'update_display_data',
        data: { 'text/plain': 'updated' },
        metadata: { changed: true },
        transient: { display_id: 'd1' },
      },
    ])
    const displays = s.records.filter((r) => r.output_type === 'display_data')
    expect(displays.length).toBe(2)
    for (const d of displays) {
      if (d.output_type !== 'display_data') throw new Error('narrow')
      expect(d.data).toEqual({ 'text/plain': 'updated' })
      expect(d.metadata).toEqual({ changed: true })
    }
  })

  it('update_display_data with unknown id is a no-op', () => {
    const s = feed([
      {
        msg_type: 'display_data',
        data: { 'text/plain': 'x' },
        metadata: {},
        transient: { display_id: 'd1' },
      },
      {
        msg_type: 'update_display_data',
        data: { 'text/plain': 'y' },
        metadata: {},
        transient: { display_id: 'unknown' },
      },
    ])
    const d = s.records[0]
    if (d.output_type !== 'display_data') throw new Error('expected display_data')
    expect(d.data).toEqual({ 'text/plain': 'x' })
  })
})

describe('applyIOPub – clear_output', () => {
  it('immediate clear (wait: false)', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'a' },
      { msg_type: 'clear_output', wait: false },
    ])
    expect(s.records).toEqual([])
    expect(s.pendingClear).toBe(false)
  })

  it('deferred clear (wait: true) does not clear until next non-status msg', () => {
    let s = createOutputArea()
    s = applyIOPub(s, { msg_type: 'stream', name: 'stdout', text: 'a' })
    s = applyIOPub(s, { msg_type: 'clear_output', wait: true })
    expect(s.records.length).toBe(1)
    expect(s.pendingClear).toBe(true)

    s = applyIOPub(s, { msg_type: 'status', execution_state: 'busy' })
    expect(s.records.length).toBe(1)
    expect(s.pendingClear).toBe(true)

    s = applyIOPub(s, {
      msg_type: 'display_data',
      data: { 'text/plain': 'next' },
      metadata: {},
    })
    expect(s.records).toEqual([
      { output_type: 'display_data', data: { 'text/plain': 'next' }, metadata: {} },
    ])
    expect(s.pendingClear).toBe(false)
  })
})

describe('applyIOPub – error and execute_result', () => {
  it('appends an error record verbatim', () => {
    const s = feed([
      {
        msg_type: 'error',
        ename: 'ValueError',
        evalue: 'bad',
        traceback: ['line1', 'line2'],
      },
    ])
    expect(s.records).toEqual([
      { output_type: 'error', ename: 'ValueError', evalue: 'bad', traceback: ['line1', 'line2'] },
    ])
  })

  it('execute_result carries execution_count', () => {
    const s = feed([
      {
        msg_type: 'execute_result',
        execution_count: 7,
        data: { 'text/plain': '42' },
        metadata: {},
      },
    ])
    expect(s.records).toEqual([
      {
        output_type: 'execute_result',
        execution_count: 7,
        data: { 'text/plain': '42' },
        metadata: {},
      },
    ])
  })
})

describe('applyIOPub – status', () => {
  it('status messages are no-ops on records', () => {
    const before = feed([{ msg_type: 'stream', name: 'stdout', text: 'a' }])
    const after = applyIOPub(before, { msg_type: 'status', execution_state: 'idle' })
    expect(after.records).toBe(before.records)
    expect(after.pendingClear).toBe(before.pendingClear)
  })
})

describe('applyIOPub – widget comm (iopub)', () => {
  it('does not append comm_open / comm_msg / comm_close as output records', () => {
    const s = feed([
      { msg_type: 'stream', name: 'stdout', text: 'x\n' },
      {
        msg_type: 'comm_open',
        content: {
          comm_id: 'c1',
          target_name: 'jupyter.widget',
          data: { state: { _model_name: 'IntSliderModel' }, buffer_paths: [] },
        },
      },
      {
        msg_type: 'comm_msg',
        content: { comm_id: 'c1', data: { state: { value: 3 } } },
      },
      {
        msg_type: 'comm_close',
        content: { comm_id: 'c1', data: {} },
      },
    ])
    expect(s.records).toEqual([{ output_type: 'stream', name: 'stdout', text: 'x\n' }])
  })

  it('flushes pending clear when comm_open arrives', () => {
    let s = createOutputArea()
    s = applyIOPub(s, { msg_type: 'clear_output', wait: true })
    expect(s.pendingClear).toBe(true)
    s = applyIOPub(s, {
      msg_type: 'comm_open',
      content: { comm_id: 'c', target_name: 'jupyter.widget', data: {} },
    })
    expect(s.pendingClear).toBe(false)
    expect(s.records).toEqual([])
  })
})
