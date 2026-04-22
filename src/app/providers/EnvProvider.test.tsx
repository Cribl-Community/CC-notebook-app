import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EnvProvider, useEnv } from './EnvProvider'

function Reveal() {
  const env = useEnv()
  return <div data-testid="env">{JSON.stringify(env)}</div>
}

describe('EnvProvider', () => {
  it('supplies the injected env snapshot', () => {
    render(
      <EnvProvider value={{ apiBase: 'https://example', isCriblHosted: true, isKvMock: false }}>
        <Reveal />
      </EnvProvider>,
    )
    const env = JSON.parse(screen.getByTestId('env').textContent!)
    expect(env.apiBase).toBe('https://example')
    expect(env.isCriblHosted).toBe(true)
    expect(env.isKvMock).toBe(false)
  })

  it('falls back to readEnv() when no value is passed (jsdom → empty apiBase)', () => {
    render(
      <EnvProvider>
        <Reveal />
      </EnvProvider>,
    )
    const env = JSON.parse(screen.getByTestId('env').textContent!)
    expect(env.apiBase).toBe('')
    expect(env.isKvMock).toBe(true)
  })
})
