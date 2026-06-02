import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TagMultiFilter } from './TagMultiFilter'

describe('TagMultiFilter', () => {
  it('renders nothing when there are no tags', () => {
    const { container } = render(
      <TagMultiFilter
        summary="S"
        hint="H"
        allTags={[]}
        selected={[]}
        onToggle={vi.fn()}
        onClear={vi.fn()}
      />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('toggles tag and clears', () => {
    const onToggle = vi.fn()
    const onClear = vi.fn()
    render(
      <TagMultiFilter
        summary="Filter"
        hint="Hint"
        allTags={['a', 'b']}
        selected={['a']}
        onToggle={onToggle}
        onClear={onClear}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'b' }))
    expect(onToggle).toHaveBeenCalledWith('b')
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }))
    expect(onClear).toHaveBeenCalled()
  })
})
