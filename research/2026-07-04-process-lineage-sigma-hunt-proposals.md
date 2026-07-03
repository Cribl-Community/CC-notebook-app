# Solution Proposals — Process Lineage Sigma Hunt notebook

Context
- Request: Add a bundled example notebook for process-lineage hunts that follows
  [sigmalineage-mcp](https://github.com/MohitDabas/sigmalineage-mcp) closely, uses sample datasets
  hosted on GitHub, and is structured like the Anomaly Detection sample notebook.
- Research source: `research/2026-07-04-process-lineage-sigma-hunt-research.md`.

## Proposal 1 — Precomputed CSVs + in-kernel lineage/rarity (Search `externaldata` + networkx)

Overview: Publish pre-parsed Windows telemetry CSVs (process-creation events, precomputed Sigma
hits, network/logon telemetry) to `michaelhyatt/notebook-app-example-data` under
`process-lineage/`. The notebook loads them with `%%cribl_search externaldata` (identical to the
Anomaly/Malware notebooks), then reproduces the three upstream MCP capabilities in pure
pandas/`networkx`: (a) resolve parent→child links, (b) trace each Sigma hit's lineage up to 5
ancestors and render both a text kill-chain and a `networkx`/matplotlib graph, (c) compute the
rarity baseline over the three tuple families.

Key changes
- New `public/Examples/Process_Lineage_Sigma_Hunt.ipynb`.
- 3 hosted CSVs + generator script `scripts/build-process-lineage-samples.mjs` + `public/data/`
  mirror (same convention as `scripts/build-malware-hunt-samples.mjs`).
- Register URLs in `src/domain/exampleDataUrls.ts`; metadata in `EXAMPLE_METADATA`.
- Release note; brief `networkx` mention in `docs/PYODIDE_CUSTOMIZATIONS.md`.

Trade-offs
- + Runs out-of-the-box under Run All (no auth, no proxy change); matches existing patterns exactly;
  reproduces all three MCP tools faithfully; adds the first graph-visualization example.
- + `networkx` already in lockfile — no `micropip` pin/proxy risk.
- − Requires generating + pushing sample data to the external repo (user-owned).
- − Cannot literally run Chainsaw/Sigma matching in-browser → hits are precomputed (documented as a
  data-plane boundary, same spirit as Malware notebook's precomputed TI).

Validation
- `npm test` (contract test + `ipynb.test.ts` parse). Local `npm run dev` → Welcome → open + Run
  All. `npm run e2e:examples` picks it up via `@examples-all`.

Open questions
- Group ordering slot (`recommendedOrder`) among the hunt notebooks.

## Proposal 2 — Bundle CSVs inside the pack (`public/data/`) and read via Pyodide `pyfetch`

Overview: Ship the CSVs inside the app pack under `public/data/process-lineage/` and read them in
Pyodide with `pyfetch(f"{CRIBL_BASE_PATH}/data/...")`, avoiding the external GitHub repo.

Key changes: notebook + CSVs in `public/data/`; no `exampleDataUrls.ts` change.

Trade-offs
- + No external repo dependency.
- − **Contradicts the request** ("datasets hosted in my github").
- − Diverges from the established `externaldata` pattern; Search-side `externaldata` cannot read the
  app pack path (research §6), so the notebook would not demonstrate the Cribl Search data plane.
- − Bundling CSVs risks the 1 MiB example guard / pack bloat and complicates the size story.

Validation: same as P1 minus the contract test.

Open questions: same.

## Decision

**Proposal 1** — it satisfies the explicit "hosted in my github" requirement, mirrors the
Anomaly/Malware notebooks (the requested template), reuses the existing URL-registry + contract-test
machinery, and faithfully reproduces the sigmalineage-mcp lineage + rarity logic with libraries
already available in the kernel.
