/**
 * Append a block when shipping a new version (keep newest first).
 * Mirrors package.json version for the latest entry.
 */
export type ReleaseEntry = {
  version: string
  /** ISO date or human-readable */
  date: string
  highlights: string[]
}

export const RELEASE_NOTES: ReleaseEntry[] = [
  {
    version: '1.0.27',
    date: '2026-04-20',
    highlights: [
      'Welcome tab with product overview, release highlights, and quick links to bundled Examples notebooks.',
      'Bundled Examples: Cribl Search (%%cribl_search) walkthrough and Matplotlib recipes.',
      'Tab key triggers richer Python completion (Jedi) in code cells, in addition to attribute completion after “.”',
      'Default experience opens the Welcome tab instead of an empty Untitled notebook.',
    ],
  },
  {
    version: '1.0.26',
    date: '2026',
    highlights: [
      'Multi-tab notebooks with one Pyodide kernel per tab.',
      'Cribl Search magic cells, KV-backed library, and Jupyter-style outputs.',
    ],
  },
]
