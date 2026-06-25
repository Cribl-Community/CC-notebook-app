import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NB_KV_PREFIX } from '@/domain/notebookManifest'
import {
  resolveNotebookLibraryKvRoot,
  resetNotebookLibraryKvRootCacheForTests,
} from '@platform/cribl/criblUser'

describe('resolveNotebookLibraryKvRoot', () => {
  const prev = window.getCriblUser

  beforeEach(() => {
    resetNotebookLibraryKvRootCacheForTests()
  })

  afterEach(() => {
    resetNotebookLibraryKvRootCacheForTests()
    if (prev !== undefined) window.getCriblUser = prev
    else delete window.getCriblUser
  })

  it('returns legacy NB_KV_PREFIX when getCriblUser is missing', async () => {
    delete window.getCriblUser
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(NB_KV_PREFIX)
  })

  it('returns scoped path when user has id and username', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'alice' })
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(`${NB_KV_PREFIX}/u/u1/alice`)
  })

  it('encodes id and username for KV path segments', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'a/b', username: 'x y' })
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(
      `${NB_KV_PREFIX}/u/${encodeURIComponent('a/b')}/${encodeURIComponent('x y')}`,
    )
  })

  it('returns legacy when id is empty', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: '', username: 'bob' })
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(NB_KV_PREFIX)
  })

  it('returns legacy when username is whitespace only', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'x', username: '  ' })
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(NB_KV_PREFIX)
  })

  it('returns legacy when getCriblUser rejects', async () => {
    window.getCriblUser = vi.fn().mockRejectedValue(new Error('unavailable'))
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(NB_KV_PREFIX)
  })

  it('calls getCriblUser only once while cache is warm', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', username: 'a' })
    window.getCriblUser = fn
    await resolveNotebookLibraryKvRoot()
    await resolveNotebookLibraryKvRoot()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
