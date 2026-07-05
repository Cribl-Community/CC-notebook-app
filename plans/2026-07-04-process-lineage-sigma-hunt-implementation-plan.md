# Implementation Plan — Process Lineage Sigma Hunt sample notebook

Chosen proposal: **Proposal 1** (precomputed CSVs on GitHub + in-kernel lineage/rarity via
`%%cribl_search externaldata` + `networkx`). See
`research/2026-07-04-process-lineage-sigma-hunt-proposals.md`.

Do not implement yet — this is the plan only.

## Goals / non-goals
- Goal: A bundled, Run-All-clean example notebook that reproduces sigmalineage-mcp's three tools
  (Sigma-hit lineage tracing + process kill-chain visualization + rare-tuple baseline) over hosted
  Windows telemetry CSVs, structured like the Anomaly/Malware examples.
- Non-goal: Running Chainsaw/Sigma matching or raw `.evtx` parsing in the browser (precompute hits
  into a hosted CSV instead). No `config/proxies.yml` changes (Search fetches the CSVs).

## Datasets (host on `michaelhyatt/notebook-app-example-data`, folder `process-lineage/`)
1. `windows_process_events.csv` — process-creation telemetry (Sysmon EID 1 + Security EID 4688),
   columns: `UtcTime, Computer, User, EventID, Channel, ProcessGuid, ProcessId, Image, CommandLine,
   ParentProcessGuid, ParentProcessId, ParentImage, ParentCommandLine`. Include a realistic
   multi-generation attack chain (e.g. `services.exe → wmiprvse.exe → powershell.exe → rundll32.exe`
   from `ProgramData`) plus benign noise.
2. `sigma_hits.csv` — precomputed Chainsaw/Sigma hits, columns: `rule_name, level, ProcessGuid,
   ProcessId, Computer, UtcTime, Image, CommandLine` (keys join to `windows_process_events.csv`).
3. `windows_telemetry_events.csv` — mixed telemetry for the rarity engine: network (Sysmon EID 3:
   `Image, DestinationPort, Protocol, DestinationHostname, User`), logon (EID 4624: `User, Channel,
   EventID`), DNS/URL (`url, Computer, Image`). Include a few rare tuples that stand out vs. baseline.

Sizing: keep each CSV small (hundreds of rows) so lineage/rarity are legible and within the 12,000
row Search cap.

## Notebook outline (`public/Examples/Process_Lineage_Sigma_Hunt.ipynb`)
Mirror Malware/Anomaly structure; all outputs cleared; file < 1 MiB.
1. Title + intro (markdown) — attribute [sigmalineage-mcp](https://github.com/MohitDabas/sigmalineage-mcp);
   state the data-plane boundary (Chainsaw/EVTX parsing precomputed; lineage + rarity run in-kernel).
2. "What you will do" table + ASCII data-flow.
3. Prerequisites (hosted app w/ Cribl Search; no auth; no proxy change; Run Setup first).
4. **Setup** code cell — URLs (kept in sync with `exampleDataUrls.ts`) + helper functions ported
   from `sigma_lineage.py`/`rarity.py`: `parse_pid`, `parse_time`, `normalize_process_rows`,
   `resolve_parent_links` (GUID first, else nearest-earlier `(computer, parent_pid)`),
   `trace_lineage(hit, levels=5)`, `render_lineage_tree` (text `└─` + `(HIT)`), `build_lineage_graph`
   (networkx DiGraph), and `compute_rare_events_with_baseline` (three tuple families).
5. §A Load process events via `%%cribl_search var=proc_events_raw ... externaldata` → normalize to
   `proc_events`.
6. §B Load Sigma hits via `externaldata` → `sigma_hits`.
7. §C Build the process index + resolve parent links; print counts.
8. §D Trace lineage for each hit (≤5 levels); print the text kill-chain(s).
9. §E Draw the kill-chain with `networkx` + matplotlib (`import networkx as nx`; nodes colored,
   hit node highlighted).
10. §F Load `windows_telemetry_events.csv` via `externaldata`; run the rarity baseline; show the
    top rare tuples per family.
11. §G matplotlib bar charts of rarity scores per family.
12. Interpretation (lineage = the story of a hit; rarity surfaces anomalous port/user/URL tuples).
13. Troubleshooting table (stale tab, empty externaldata, missing helpers, etc.).

## Code/registry changes
- `src/domain/exampleDataUrls.ts` — add `EXAMPLE_DATA_PATHS`/`EXAMPLE_DATA_URLS` entries:
  `processLineageProcessEvents`, `processLineageSigmaHits`, `processLineageTelemetry`
  (`process-lineage/…csv`).
- `vite.examplesManifestPlugin.ts` — add `EXAMPLE_METADATA['Process_Lineage_Sigma_Hunt.ipynb']`:
  summary; `tags: ['security','threat-hunting','sigma','evtx','process-lineage','networkx',
  'externaldata','visualization']`; `level: 'advanced'`; `estimatedRuntime: '15–25 min first run'`;
  `recommendedOrder: 4` (groups with the hunt notebooks; tie broken alphabetically).
- `scripts/build-process-lineage-samples.mjs` — deterministic generator writing the 3 CSVs to
  `public/data/process-lineage/` (mirror to publish to the example-data repo). Follow
  `scripts/build-malware-hunt-samples.mjs`.
- `src/features/welcome/releaseNotes.ts` — prepend a highlight for the new example.
- `docs/PYODIDE_CUSTOMIZATIONS.md` — one line: notebook uses lockfile `networkx` (no micropip pin).

## E2E tests (update in this PR)
The notebook is auto-picked up by the manifest-driven `@examples-all` matrix
(`e2e/specs/all-example-notebooks.spec.ts:70-116`) with no code change — but that suite is opt-in
(`npm run e2e:examples`) and not part of the default `npm run e2e`. Following the pattern of the
other focused hunt/visualization specs, add a dedicated `@regression @slow` spec so it also runs in
the standard slow phase.

- **New focused spec** `e2e/specs/process-lineage-sigma-hunt-example.spec.ts`, modeled on
  `e2e/specs/visualisations-example.spec.ts` / `zz-anomaly-detection-example.spec.ts`:
  - Tags: `@regression @slow`. **Not** `@heavy` — `networkx` is a light lockfile package and there is
    no large `micropip` stack, so keep it in `e2e:slow` (excluded from `e2e:quick`). Do **not** add the
    filename to `HEAVY_EXAMPLE` in `all-example-notebooks.spec.ts`.
  - Flow: `navigateToStagingNotebookApp` → `getNotebookFrame` → `openBundledExample(nb,
    'Process_Lineage_Sigma_Hunt.ipynb')` → wait for tab title `Process Lineage Sigma Hunt` →
    `waitForKernelReady(nb, 480_000)` → click **Run All** → wait `.nb-kernel-status` `Ready`
    (~900_000 ms) → `expectNoCriticalNotebookErrors(nb)`.
  - Assert the lineage graph rendered: matplotlib PNG output is
    `<img class="nb-mime-image">` (`src/features/notebook/ui/MimeBundleView.tsx:139-140`), so
    `await expect(nb.locator('.nb-mime-image').first()).toBeVisible({ timeout: 300_000 })`.
  - `test.setTimeout(1_200_000)` and `test.describe.configure({ retries: 1 })` (match the sibling
    slow specs).
- **`docs/E2E_STAGING.md`** — add a row to the "What the specs cover" table (line ~90) for the new
  spec: `Process Lineage Sigma Hunt notebook: Run All (externaldata, networkx lineage graph, rarity
  charts) | e2e/specs/process-lineage-sigma-hunt-example.spec.ts | @regression, @slow`, and mention
  it in the "Main flows exercised" paragraph.
- **No change needed** to `all-example-notebooks.spec.ts` beyond the automatic manifest pickup
  (the new notebook must not raise intentional errors, so it is **not** added to
  `ALLOWED_INTENTIONAL_ERROR_ENAMES`).

## Testing / validation
- `npm test` — `exampleDataUrls.contract.test.ts` (new URLs registered) + `ipynb.test.ts` (parses).
- `npm run lint`; `npm run build`.
- Publish the 3 CSVs to `michaelhyatt/notebook-app-example-data` before any Run All / E2E.
- `npm run dev` → Welcome → open "Process Lineage Sigma Hunt" → Run All (after CSVs are live).
- `npm run e2e` (runs the new `@slow` focused spec) and/or `npm run e2e:examples` (full matrix).

## Risks
- Data not yet live in the external repo → Run All fails until CSVs are pushed (documented).
- `recommendedOrder` collision reorders the Welcome list slightly (cosmetic).
