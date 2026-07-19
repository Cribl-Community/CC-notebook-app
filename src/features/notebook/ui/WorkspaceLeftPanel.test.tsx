import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import {
  WorkspaceLeftPanel,
  type LeftPanelMode,
} from '@features/notebook/ui/WorkspaceLeftPanel'

function Harness({ initialMode = 'library' as LeftPanelMode }) {
  const [mode, setMode] = useState<LeftPanelMode>(initialMode)
  return (
    <WorkspaceLeftPanel
      mode={mode}
      onModeChange={setMode}
      open
      bodyWidth={280}
      onResizePointerDown={vi.fn()}
      library={<div data-testid="library-body">Library body</div>}
      chat={<div data-testid="chat-body">Chat body</div>}
    />
  )
}

describe('WorkspaceLeftPanel', () => {
  it('switches between Notebooks and AI Chat modes', () => {
    render(<Harness />)

    const libraryTab = screen.getByRole('tab', { name: 'Notebooks' })
    const chatTab = screen.getByRole('tab', { name: 'AI Chat' })
    expect(libraryTab).toHaveAttribute('aria-selected', 'true')
    expect(chatTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('library-body').closest('[role="tabpanel"]')).not.toHaveAttribute(
      'hidden',
    )
    expect(screen.getByTestId('chat-body').closest('[role="tabpanel"]')).toHaveAttribute('hidden')

    fireEvent.click(chatTab)
    expect(chatTab).toHaveAttribute('aria-selected', 'true')
    expect(libraryTab).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('chat-body').closest('[role="tabpanel"]')).not.toHaveAttribute(
      'hidden',
    )
    expect(screen.getByTestId('library-body').closest('[role="tabpanel"]')).toHaveAttribute('hidden')

    // Both panels stay mounted so chat session state can survive mode switches.
    expect(screen.getByTestId('chat-body')).toBeInTheDocument()
    expect(screen.getByTestId('library-body')).toBeInTheDocument()
  })

  it('keeps the chat panel mounted while Notebooks is selected', () => {
    render(<Harness initialMode="chat" />)
    fireEvent.click(screen.getByRole('tab', { name: 'Notebooks' }))
    expect(screen.getByTestId('chat-body')).toBeInTheDocument()
    expect(screen.getByTestId('chat-body').closest('[role="tabpanel"]')).toHaveAttribute('hidden')
  })
})
