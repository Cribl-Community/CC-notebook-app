import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MimeBundleView } from '@features/notebook/ui/MimeBundleView'

describe('MimeBundleView security behavior', () => {
  it('sanitizes markdown script tags', () => {
    const { container } = render(
      <MimeBundleView
        data={{ 'text/markdown': 'safe text\n\n<script>alert(1)</script>' }}
        metadata={{}}
      />,
    )

    expect(container.querySelector('.nb-mime-markdown')).not.toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(screen.getByText('safe text')).toBeTruthy()
  })

  it('sanitizes html event handlers in non-scripted html path', () => {
    const { container } = render(
      <MimeBundleView
        data={{ 'text/html': '<img src=x onerror="alert(1)"><p>ok</p>' }}
        metadata={{}}
      />,
    )

    const htmlRoot = container.querySelector('.nb-mime-html')
    expect(htmlRoot).not.toBeNull()
    expect(container.querySelector('img')?.getAttribute('onerror')).toBeNull()
    expect(screen.getByText('ok')).toBeTruthy()
  })

  it('uses sandboxed iframe for scripted html outputs', () => {
    const { container } = render(
      <MimeBundleView
        data={{ 'text/html': '<div id="x"></div><script>window.test=1</script>' }}
        metadata={{}}
      />,
    )

    const frame = container.querySelector('iframe.nb-mime-html-iframe')
    expect(frame).not.toBeNull()
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
  })
})
