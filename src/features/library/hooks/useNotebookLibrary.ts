import { useCallback, useEffect, useMemo, useState } from 'react'
import { listMoveTargets } from '@features/library/manifest'
import type { Manifest } from '@features/library/manifest'
import { useNotebookRepo } from '@app/providers'

export type MoveDestination = { id: string | null; label: string }

/**
 * UI state for the notebook library sidebar: the manifest itself, async
 * load status/error, transient selections (which folder to save under,
 * which item is currently being moved) and a save-in-progress flag.
 *
 * Extracted from NotebookPage so the workspace view can stay focused on
 * composition and the library concern can grow its own tests.
 */
export interface NotebookLibraryController {
  manifest: Manifest | null
  setManifest: (m: Manifest | null) => void
  loading: boolean
  error: string | null
  selectedParentId: string | null
  setSelectedParentId: (id: string | null) => void
  movingId: string | null
  setMovingId: (id: string | null) => void
  saveBusy: boolean
  setSaveBusy: (b: boolean) => void
  /** Valid target folders for the currently-moving item, or [] when nothing is moving. */
  moveDestinations: MoveDestination[]
  /** Re-fetch the manifest from the repo. Swallows errors into `error`. */
  reload: () => Promise<void>
}

export function useNotebookLibrary(): NotebookLibraryController {
  const repo = useNotebookRepo()
  const [manifest, setManifest] = useState<Manifest | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const m = await repo.readManifest()
      setManifest(m)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load notebooks')
    } finally {
      setLoading(false)
    }
  }, [repo])

  useEffect(() => {
    const id = window.setTimeout(() => {
      void reload()
    }, 0)
    return () => clearTimeout(id)
  }, [reload])

  const moveDestinations = useMemo(
    () => (movingId ? listMoveTargets(manifest?.items ?? [], movingId) : []),
    [manifest, movingId],
  )

  return {
    manifest,
    setManifest,
    loading,
    error,
    selectedParentId,
    setSelectedParentId,
    movingId,
    setMovingId,
    saveBusy,
    setSaveBusy,
    moveDestinations,
    reload,
  }
}
