import { describe, it, expect } from 'vitest'
import {
  extractCriblSearchRenderedQueryFromOutputs,
  shouldSuppressCriblSearchJinjaRenderIOPub,
} from '@features/cribl-search/criblSearchJinjaRender'
import type { IOPubMessage, OutputRecord } from '@platform/pyodide/types'

describe('criblSearchJinjaRender', () => {
  it('suppresses only display/execute_result IOPub', () => {
    expect(shouldSuppressCriblSearchJinjaRenderIOPub({ msg_type: 'execute_result', data: {} } as IOPubMessage)).toBe(
      true,
    )
    expect(
      shouldSuppressCriblSearchJinjaRenderIOPub({ msg_type: 'display_data', data: {} } as IOPubMessage),
    ).toBe(true)
    const stream: IOPubMessage = { msg_type: 'stream', name: 'stdout', text: 'x' }
    expect(shouldSuppressCriblSearchJinjaRenderIOPub(stream)).toBe(false)
  })

  it('extractCriblSearchRenderedQueryFromOutputs reads application/json execute_result', () => {
    const o: OutputRecord = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'application/json': JSON.stringify({ __cribl_search_rendered: 'd | x' }) },
      metadata: {},
    }
    expect(extractCriblSearchRenderedQueryFromOutputs([o])).toBe('d | x')
  })

  it('extractCriblSearchRenderedQueryFromOutputs uses last execute_result', () => {
    const a: OutputRecord = {
      output_type: 'execute_result',
      execution_count: 1,
      data: { 'application/json': JSON.stringify({ __cribl_search_rendered: 'first' }) },
      metadata: {},
    }
    const b: OutputRecord = {
      output_type: 'execute_result',
      execution_count: 2,
      data: { 'application/json': JSON.stringify({ __cribl_search_rendered: 'second' }) },
      metadata: {},
    }
    expect(extractCriblSearchRenderedQueryFromOutputs([a, b])).toBe('second')
  })

  it('extractCriblSearchRenderedQueryFromOutputs falls back to text/plain repr of dict with simple string', () => {
    const o: OutputRecord = {
      output_type: 'execute_result',
      execution_count: 0,
      data: { 'text/plain': `{'__cribl_search_rendered': 'where x == 1'}` },
      metadata: {},
    }
    expect(extractCriblSearchRenderedQueryFromOutputs([o])).toBe('where x == 1')
  })
})
