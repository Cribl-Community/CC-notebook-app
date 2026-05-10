import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownCell } from '@features/notebook/ui/MarkdownCell'

describe('MarkdownCell rendered markdown', () => {
  it('preserves target and rel on anchor tags', () => {
    const cell = {
      id: 'c1',
      cell_type: 'markdown' as const,
      editing: false,
      source:
        '<a href="https://example.org/doc" target="_blank" rel="noopener noreferrer">more</a>',
    }
    render(
      <MarkdownCell
        cell={cell}
        isSelected={false}
        onSelect={vi.fn()}
        onToggleEdit={vi.fn()}
        onDelete={vi.fn()}
        onChange={vi.fn()}
      />,
    )
    const link = screen.getByRole('link', { name: 'more' })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })
})
