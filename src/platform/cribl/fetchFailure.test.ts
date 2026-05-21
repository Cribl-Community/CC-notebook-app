import { describe, expect, it } from 'vitest'
import { describeFetchError, isCorsOrNetworkFetchError } from '@platform/cribl/fetchFailure'

describe('isCorsOrNetworkFetchError', () => {
  it('treats TypeError failed fetch as cors/network', () => {
    expect(isCorsOrNetworkFetchError(new TypeError('Failed to fetch'))).toBe(true)
  })

  it('does not classify abort errors as cors/network', () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    expect(isCorsOrNetworkFetchError(err)).toBe(false)
  })

  it('matches common cors wording from string errors', () => {
    expect(isCorsOrNetworkFetchError('NetworkError when attempting to fetch resource')).toBe(true)
  })
})

describe('describeFetchError', () => {
  it('adds non-retry guidance for cors/network failures', () => {
    expect(describeFetchError(new TypeError('Failed to fetch'), 'Search job create')).toContain(
      'not retried',
    )
  })

  it('passes through non-fetch errors unchanged', () => {
    expect(describeFetchError(new Error('HTTP 500 bad'))).toBe('HTTP 500 bad')
  })

  it('does not stack a second “failed immediately” prefix', () => {
    const inner = describeFetchError(new TypeError('Failed to fetch'), 'AI translation request')
    expect(describeFetchError(new Error(inner), 'Cribl Search request')).toBe(inner)
  })
})
