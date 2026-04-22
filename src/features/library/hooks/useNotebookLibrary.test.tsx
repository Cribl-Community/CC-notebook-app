import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useNotebookLibrary } from './useNotebookLibrary'

vi.mock('@features/library/notebookLibrary', () => ({
  fetchManifest: vi.fn(),
}))

import { fetchManifest } from '@features/library/notebookLibrary'

const fetchManifestMock = vi.mocked(fetchManifest)

describe('useNotebookLibrary', () => {
  beforeEach(() => {
    fetchManifestMock.mockReset()
  })

  afterEach(() => {
    fetchManifestMock.mockReset()
  })

  it('auto-reloads on mount and exposes manifest', async () => {
    fetchManifestMock.mockResolvedValue({ version: 1, items: [] })
    const { result } = renderHook(() => useNotebookLibrary())

    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.manifest).toEqual({ version: 1, items: [] })
    expect(result.current.error).toBeNull()
  })

  it('captures reload errors into the error field', async () => {
    fetchManifestMock.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() => useNotebookLibrary())

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.error).toBe('boom')
    expect(result.current.manifest).toBeNull()
  })

  it('moveDestinations is empty when nothing is moving', async () => {
    fetchManifestMock.mockResolvedValue({
      version: 1,
      items: [
        { id: 'f1', type: 'folder', parentId: null, name: 'Folder', updatedAt: '' },
        { id: 'n1', type: 'notebook', parentId: null, name: 'N', updatedAt: '' },
      ],
    })
    const { result } = renderHook(() => useNotebookLibrary())
    await waitFor(() => expect(result.current.manifest).not.toBeNull())

    expect(result.current.moveDestinations).toEqual([])

    act(() => {
      result.current.setMovingId('n1')
    })
    expect(result.current.moveDestinations.length).toBeGreaterThan(0)
  })
})
