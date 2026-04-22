import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

describe('react testing environment', () => {
  it('renders a simple component', () => {
    const { container } = render(<div data-testid="ok">hi</div>)
    expect(container.textContent).toBe('hi')
  })
})
