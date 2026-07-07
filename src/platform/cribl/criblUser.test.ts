import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NB_KV_PREFIX } from '@/domain/notebookManifest'
import {
  resolveNotebookLibraryKvRoot,
  resolveNotebookLibraryUsername,
  resetNotebookLibraryKvRootCacheForTests,
} from '@platform/cribl/criblUser'

describe('resolveNotebookLibraryUsername', () => {
  const prev = window.getCriblUser

  beforeEach(() => {
    resetNotebookLibraryKvRootCacheForTests()
  })

  afterEach(() => {
    resetNotebookLibraryKvRootCacheForTests()
    if (prev !== undefined) window.getCriblUser = prev
    else delete window.getCriblUser
  })

  it('returns null when getCriblUser is missing', async () => {
    delete window.getCriblUser
    await expect(resolveNotebookLibraryUsername()).resolves.toBeNull()
  })

  it('returns username when getCriblUser resolves', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'alice' })
    await expect(resolveNotebookLibraryUsername()).resolves.toBe('alice')
  })

  it('returns null when username is whitespace only', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'x', username: '  ' })
    await expect(resolveNotebookLibraryUsername()).resolves.toBeNull()
  })

  it('returns null when getCriblUser rejects', async () => {
    window.getCriblUser = vi.fn().mockRejectedValue(new Error('unavailable'))
    await expect(resolveNotebookLibraryUsername()).resolves.toBeNull()
  })

  it('calls getCriblUser only once while cache is warm', async () => {
    const fn = vi.fn().mockResolvedValue({ id: '1', username: 'a' })
    window.getCriblUser = fn
    await resolveNotebookLibraryUsername()
    await resolveNotebookLibraryUsername()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('resolveNotebookLibraryKvRoot always returns legacy prefix', async () => {
    window.getCriblUser = vi.fn().mockResolvedValue({ id: 'u1', username: 'alice' })
    await expect(resolveNotebookLibraryKvRoot()).resolves.toBe(NB_KV_PREFIX)
  })
})
