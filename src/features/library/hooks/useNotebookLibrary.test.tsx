import { describe, it, expect, vi, afterEach } from 'vitest'
import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { Manifest } from '@features/library/manifest'
import type { NotebookRepo } from '@ports/NotebookRepo'
import { NotebookRepoProvider } from '@app/providers'
import { useNotebookLibrary } from './useNotebookLibrary'

function wrapperFor(repo: NotebookRepo) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <NotebookRepoProvider value={repo}>{children}</NotebookRepoProvider>
  }
}

function emptyRepo(readManifest: NotebookRepo['readManifest']): NotebookRepo {
  return {
    readManifest,
    writeManifest: vi.fn(async () => {}),
    readPayload: vi.fn(async () => null),
    writePayload: vi.fn(async () => {}),
    deletePayload: vi.fn(async () => {}),
  }
}

describe('useNotebookLibrary', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('auto-reloads on mount and exposes manifest', async () => {
    const readManifest = vi.fn(async (): Promise<Manifest> => ({ version: 1, items: [] }))
    const repo = emptyRepo(readManifest as NotebookRepo['readManifest'])
    const { result } = renderHook(() => useNotebookLibrary(), { wrapper: wrapperFor(repo) })

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.manifest).toEqual({ version: 1, items: [] })
    expect(result.current.error).toBeNull()
  })

  it('captures reload errors into the error field', async () => {
    const readManifest = vi.fn(async () => {
      throw new Error('boom')
    })
    const repo = emptyRepo(readManifest as NotebookRepo['readManifest'])
    const { result } = renderHook(() => useNotebookLibrary(), { wrapper: wrapperFor(repo) })

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.manifest).toBeNull()
  })

  it('moveDestinations is empty when nothing is moving', async () => {
    const readManifest = vi.fn(
      async (): Promise<Manifest> => ({
        version: 1,
        items: [
          { id: 'f1', type: 'folder', parentId: null, name: 'Folder', updatedAt: '' },
          { id: 'n1', type: 'notebook', parentId: null, name: 'N', updatedAt: '' },
        ],
      }),
    )
    const repo = emptyRepo(readManifest as NotebookRepo['readManifest'])
    const { result } = renderHook(() => useNotebookLibrary(), { wrapper: wrapperFor(repo) })
    await waitFor(() => expect(result.current.manifest).not.toBeNull())

    expect(result.current.moveDestinations).toEqual([])

    act(() => {
      result.current.setMovingId('n1')
    })
    expect(result.current.moveDestinations.length).toBeGreaterThan(0)
  })
})
