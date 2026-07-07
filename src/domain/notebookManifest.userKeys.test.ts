import { describe, expect, it } from 'vitest'
import {
  filterManifestItemsByOwner,
  mergeManifestForOwner,
  NB_KV_PREFIX,
  userNotebookPayloadKey,
  usernameStorageToken,
  type ManifestItem,
} from '@/domain/notebookManifest'

describe('per-user notebook KV keys', () => {
  it('usernameStorageToken is URL-safe for notebook id segments', () => {
    expect(usernameStorageToken('alice')).toBe('alice')
    expect(usernameStorageToken('Michael Hyatt')).toBe('Michael_Hyatt')
    expect(usernameStorageToken('a/b')).toBe('a_b')
    expect(usernameStorageToken('google-oauth2|103')).toBe('google-oauth2_103')
  })

  it('userNotebookPayloadKey prefixes notebook uuid with username token', () => {
    expect(userNotebookPayloadKey('alice', 'nb-1')).toBe(`${NB_KV_PREFIX}/notebooks/alice_nb-1`)
    expect(userNotebookPayloadKey('Michael Hyatt', '715f4894-5213-4a7d-a5b2-dce67cd010bf')).toBe(
      `${NB_KV_PREFIX}/notebooks/Michael_Hyatt_715f4894-5213-4a7d-a5b2-dce67cd010bf`,
    )
  })
})

describe('shared manifest owner filtering', () => {
  const aliceNb: ManifestItem = {
    id: 'n1',
    type: 'notebook',
    parentId: null,
    name: 'A',
    updatedAt: '1',
    tags: [],
    ownerUsername: 'alice',
  }
  const bobNb: ManifestItem = {
    id: 'n2',
    type: 'notebook',
    parentId: null,
    name: 'B',
    updatedAt: '1',
    tags: [],
    ownerUsername: 'bob',
  }
  const legacyNb: ManifestItem = {
    id: 'n0',
    type: 'notebook',
    parentId: null,
    name: 'L',
    updatedAt: '1',
    tags: [],
  }

  it('filterManifestItemsByOwner hides legacy items when username is set', () => {
    expect(filterManifestItemsByOwner([aliceNb, bobNb, legacyNb], 'alice')).toEqual([aliceNb])
    expect(filterManifestItemsByOwner([aliceNb, bobNb, legacyNb], null)).toHaveLength(3)
  })

  it('mergeManifestForOwner replaces only the current user items', () => {
    const full = { version: 1 as const, items: [aliceNb, bobNb] }
    const updatedAlice: ManifestItem = { ...aliceNb, name: 'A2' }
    const merged = mergeManifestForOwner(full, [updatedAlice], 'alice')
    expect(merged.items).toEqual([bobNb, updatedAlice])
  })
})
