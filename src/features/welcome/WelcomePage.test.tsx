import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { WelcomePage } from './WelcomePage'
import type { ExamplesLoadState } from '@features/examples'

const useExamplesMock = vi.hoisted(() => ({
  state: { kind: 'loading' } as ExamplesLoadState,
  setSelected: vi.fn(),
}))

vi.mock('@features/welcome/WelcomeProxyCheck', () => ({
  WelcomeProxyCheck: () => null,
}))

vi.mock('@features/examples', () => ({
  useExamples: () => useExamplesMock,
  exampleNotebookDisplayLabel: (filename: string) => filename,
  parseExamplesManifest: vi.fn(),
}))

describe('WelcomePage', () => {
  const defaultProps = {
    onOpenExample: vi.fn(),
    onNewNotebook: vi.fn(),
    onImportFile: vi.fn(),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useExamplesMock.state = { kind: 'loading' }
    useExamplesMock.setSelected = vi.fn()
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

  it('shows example tag filter when examples are ready with tags', () => {
    useExamplesMock.state = {
      kind: 'ready',
      notebooks: [
        {
          filename: 'a.ipynb',
          title: 'Alpha',
          summary: 'S',
          tags: ['search'],
          level: 'beginner',
          estimatedRuntime: '1 min',
          recommendedOrder: 1,
        },
        {
          filename: 'b.ipynb',
          title: 'Beta',
          summary: 'T',
          tags: ['api'],
          level: 'beginner',
          estimatedRuntime: '1 min',
          recommendedOrder: 2,
        },
      ],
      selectedFilename: 'a.ipynb',
    }
    render(<WelcomePage {...defaultProps} />)
    expect(screen.getByText('Filter examples by tag')).toBeInTheDocument()
    expect(screen.getByLabelText('Choose an example')).toBeInTheDocument()
  })
})
