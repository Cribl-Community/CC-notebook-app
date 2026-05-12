import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { WelcomePage } from './WelcomePage'

vi.mock('@features/welcome/WelcomeProxyCheck', () => ({
  WelcomeProxyCheck: () => null,
}))

vi.mock('@features/examples/useExamples', () => ({
  useExamples: () => ({
    state: { kind: 'loading' as const },
    setSelected: vi.fn(),
  }),
}))

describe('WelcomePage', () => {
  const defaultProps = {
    onOpenExample: vi.fn(),
    onNewNotebook: vi.fn(),
    onImportFile: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls onImportFile when a file is chosen', () => {
    render(<WelcomePage {...defaultProps} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(input).toBeTruthy()
    const file = new File(['{}'], 'test.ipynb', { type: 'application/json' })
    fireEvent.change(input, { target: { files: [file] } })
    expect(defaultProps.onImportFile).toHaveBeenCalledTimes(1)
    expect(defaultProps.onImportFile).toHaveBeenCalledWith(file)
  })
})
