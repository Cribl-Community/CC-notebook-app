import { describe, it, expect } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { ThemeProvider, useTheme } from './ThemeProvider'

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider>{children}</ThemeProvider>
)

describe('ThemeProvider', () => {
  it('exposes a theme and setTheme via context', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(['light', 'dark']).toContain(result.current.theme)

    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')

    act(() => result.current.toggleTheme())
    expect(result.current.theme).toBe('light')
  })

  it('throws when used outside the provider', () => {
    expect(() => renderHook(() => useTheme())).toThrow(/ThemeProvider/)
  })
})
