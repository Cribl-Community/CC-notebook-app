import { describe, it, expect, vi } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { EnvProvider } from '@app/providers'
import { useExamples } from './useExamples'

function wrapperForExamples(staticPrefix = '/x/') {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <EnvProvider
        value={{
          apiBase: '',
          isCriblHosted: false,
          isKvMock: true,
          staticAssetPrefix: staticPrefix,
        }}
      >
        {children}
      </EnvProvider>
    )
  }
}

function fakeResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe('useExamples', () => {
  it('loads the manifest and exposes its notebooks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, {
        version: 2,
        notebooks: [
          { filename: 'b.ipynb', title: 'B', recommendedOrder: 3 },
          { filename: 'a.ipynb', title: 'A', recommendedOrder: 2 },
        ],
      }),
    )

    const { result } = renderHook(
      () => useExamples({ fetchImpl: fetchImpl as unknown as typeof fetch, staticPrefix: '/x/' }),
      { wrapper: wrapperForExamples() },
    )

    expect(result.current.state.kind).toBe('loading')
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))
    if (result.current.state.kind !== 'ready') throw new Error('expected ready')
    expect(result.current.state.notebooks.map((x) => x.filename)).toEqual(['a.ipynb', 'b.ipynb'])
    expect(result.current.state.selectedFilename).toBe('a.ipynb')
    expect(fetchImpl).toHaveBeenCalledWith('/x/Examples/manifest.json')
  })

  it('reports parse failures as error state', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { nope: true }))
    const { result } = renderHook(
      () => useExamples({ fetchImpl: fetchImpl as unknown as typeof fetch, staticPrefix: '/x/' }),
      { wrapper: wrapperForExamples() },
    )

    await waitFor(() => expect(result.current.state.kind).toBe('error'))
    if (result.current.state.kind !== 'error') throw new Error('expected error')
    expect(result.current.state.message).toMatch(/Invalid examples manifest/)
  })

  it('setSelected updates the selected filename', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(200, { version: 1, notebooks: ['a.ipynb', 'b.ipynb'] }),
    )
    const { result } = renderHook(
      () => useExamples({ fetchImpl: fetchImpl as unknown as typeof fetch, staticPrefix: '/x/' }),
      { wrapper: wrapperForExamples() },
    )
    await waitFor(() => expect(result.current.state.kind).toBe('ready'))

    act(() => result.current.setSelected('b.ipynb'))
    if (result.current.state.kind !== 'ready') throw new Error('expected ready')
    expect(result.current.state.selectedFilename).toBe('b.ipynb')
  })
})
