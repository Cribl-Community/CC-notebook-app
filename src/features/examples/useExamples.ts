import { useEffect, useMemo, useState } from 'react'
import { parseExamplesManifest } from '@features/examples/examplesManifest'
import { notebookStaticPrefix } from '@platform/staticAssets'

/**
 * Discriminated union describing the lifecycle of loading the Examples
 * manifest. Keeping this explicit (rather than using three boolean flags)
 * lets the rendering code exhaustively switch on `kind`.
 */
export type ExamplesLoadState =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; notebooks: string[]; selectedFilename: string }

export interface UseExamplesOptions {
  /** Override for tests. Defaults to the browser `fetch`. */
  fetchImpl?: typeof fetch
  /** Override for tests. Defaults to {@link notebookStaticPrefix}. */
  staticPrefix?: string
}

/**
 * Fetches the Examples manifest (served as a static asset) and exposes
 * its load state. On success, the first filename is selected by default.
 * The hook is abort-safe: if it unmounts mid-fetch, the result is dropped.
 */
export function useExamples(options: UseExamplesOptions = {}): {
  state: ExamplesLoadState
  setSelected: (filename: string) => void
} {
  const fetchImpl = options.fetchImpl ?? fetch
  const staticPrefix = useMemo(
    () => options.staticPrefix ?? notebookStaticPrefix(),
    [options.staticPrefix],
  )
  const [state, setState] = useState<ExamplesLoadState>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetchImpl(`${staticPrefix}Examples/manifest.json`)
        if (!res.ok) throw new Error(`Could not load examples list (${res.status})`)
        const json: unknown = await res.json()
        const notebooks = parseExamplesManifest(json)
        if (!notebooks) throw new Error('Invalid examples manifest')
        if (cancelled) return
        const selectedFilename = notebooks[0] ?? ''
        setState({ kind: 'ready', notebooks, selectedFilename })
      } catch (e) {
        if (cancelled) return
        setState({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Failed to load examples',
        })
      }
    })()
    return () => {
      cancelled = true
    }
  }, [fetchImpl, staticPrefix])

  const setSelected = (filename: string) => {
    setState((prev) => (prev.kind === 'ready' ? { ...prev, selectedFilename: filename } : prev))
  }

  return { state, setSelected }
}
