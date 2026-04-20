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
    version: '1.0.30',
    date: '2026-04-20',
    highlights: [
      '%%cribl_search adds lang=kql|kusto|english. English queries are translated to KQL in Cribl environments before search execution.',
      'KQL translation now uses the internal authenticated endpoint /api/v1/ai/q/agents/kql.',
      'Welcome proxy check now includes the internal Cribl AI endpoint row in addition to jsDelivr, PyPI, and pythonhosted checks.',
      'Cribl Search example notebook now includes both an English-query flow and the original KQL flow with a separate DataFrame and visualization.',
    ],
  },
  {
    version: '1.0.28',
    date: '2026-04-20',
    highlights: [
      'micropip installs from PyPI: kernel fetches now route through the pack proxy, so non-vendored wheels (any pure-Python or wasm32 package on PyPI) work in the staged app.',
      'Welcome tab: Pack proxy check — quick GETs to each host in config/proxies.yml (jsDelivr, PyPI, pythonhosted) with status and timing.',
    ],
  },
  {
    version: '1.0.27',
    date: '2026-04-19',
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
