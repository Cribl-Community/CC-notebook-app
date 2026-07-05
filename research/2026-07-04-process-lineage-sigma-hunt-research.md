# Research — Process Lineage Sigma Hunt sample notebook

Date: 2026-07-04
Query: Add a bundled example notebook for **process lineage hunts**, following
[MohitDabas/sigmalineage-mcp](https://github.com/MohitDabas/sigmalineage-mcp) closely, using
sample datasets hosted on GitHub, and modeled on the existing Anomaly Detection sample notebook.

## High-level summary

Bundled example notebooks are plain `.ipynb` files in `public/Examples/`. A Vite plugin
(`vite.examplesManifestPlugin.ts`) scans that directory at build/dev time and emits a v2
`manifest.json` (gitignored) whose per-notebook metadata (summary/tags/level/runtime/order) is
hardcoded in `EXAMPLE_METADATA`. Notebooks load at runtime by HTTP fetch of the static asset
(no `import.meta.glob`). Remote datasets are **not** fetched from Pyodide; hunt/anomaly notebooks
load hosted CSVs through **Cribl Search `externaldata`** (`%%cribl_search`), which registers the
raw GitHub URL. Every `raw.githubusercontent.com/michaelhyatt/notebook-app-example-data/main/...`
URL used in any bundled notebook must be registered in `src/domain/exampleDataUrls.ts` or a
contract test fails. `networkx` (3.4.2) is present in the Pyodide lockfile (loaded on
`import networkx`) and `matplotlib`/`pandas`/`numpy` are preloaded — enough to build and draw a
process-lineage graph in-kernel. `pyod`/`chainsaw`/`python-evtx` are **not** available, so Chainsaw
Sigma matching and raw EVTX parsing cannot run in-browser and must be pre-computed into hosted CSVs.

## Findings by area

### 1. Examples feature + manifest
- Feature slice: `src/features/examples/` (`examplesManifest.ts`, `useExamples.ts`, `index.ts`).
- Schema (v2), `src/features/examples/examplesManifest.ts:5-35`: `filename`, `title`, `summary`,
  `tags: string[]`, `level: 'beginner'|'intermediate'|'advanced'`, `estimatedRuntime`,
  `recommendedOrder`. No `id`/`categories`/`heavy` fields — `filename` is the identity, `tags` are
  the categories, `@heavy` is an E2E-only concept.
- Manifest is generated (gitignored) by `vite.examplesManifestPlugin.ts:137-161`; metadata lives in
  `EXAMPLE_METADATA` (`vite.examplesManifestPlugin.ts:18-118`). Missing metadata falls back to
  defaults (`examplesManifest.ts:37-46`).

### 2. Template notebooks
- **Anomaly** `public/Examples/Anomaly_Detection_PyOD.ipynb` — 52 cells; loads CSV via
  `%%cribl_search ... externaldata` (line ~475); installs pyod/scipy/sklearn/plotly via `micropip`
  in Setup; Plotly charts; attributed to upstream repo in the intro. Only `@heavy` E2E example.
- **Malware Hash Hunt** `public/Examples/Malware_Hash_Threat_Hunt.ipynb` — closest security-hunt
  analog: intro + "what you'll do" table + prerequisites, a **Setup** code cell defining all helper
  functions, `externaldata` loads for two hosted CSVs, Python normalization, KQL join, matplotlib
  bar charts, Interpretation, Troubleshooting. URLs hardcoded and kept in sync with
  `src/domain/exampleDataUrls.ts`.

### 3. Runtime loading
- `useExamples.ts:27-67` fetches `${staticAssetPrefix}Examples/manifest.json`, sorts by
  `recommendedOrder` then `title`. Opening an example fetches
  `${staticAssetPrefix}Examples/{filename}` and parses via the ipynb codec. Static prefix from
  `src/platform/staticAssets.ts` (Vite `base: './'`).

### 4. External dataset URLs
- Registry: `src/domain/exampleDataUrls.ts:5-33` — `EXAMPLE_DATA_REPO =
  michaelhyatt/notebook-app-example-data`, `EXAMPLE_DATA_BASE`, `EXAMPLE_DATA_PATHS`,
  `EXAMPLE_DATA_URLS`, `ALL_EXAMPLE_DATA_URLS`, `EXAMPLE_DATA_RAW_URL_PATTERN`.
- Contract test: `src/domain/exampleDataUrls.contract.test.ts:19-28` — any raw example-data URL in
  `public/Examples/*.ipynb` must be in `ALL_EXAMPLE_DATA_URLS`.

### 5. Physical files / packaging
- `.ipynb` live in `public/Examples/`; Vite copies `public/` to `dist/` unchanged.
- `scripts/package.mjs:8-60` asserts each example `.ipynb` ≤ 1 MiB (outputs must be cleared).

### 6. Magics + Pyodide runtime
- `%%cribl_search` (`src/features/cribl-search/criblSearchMagic.ts`): header params
  `var=`, `preview=`, `response=`, `limit=`, `earliest=`/`latest=`, `timeout=`, `lang=`,
  `template=`; loads rows into a pandas DataFrame (default `results_df`); 12,000-row Pyodide cap
  (`criblSearchDataframeHydration.ts:7-8`). `externaldata` bodies are NOT prefixed with `cribl`
  (`src/platform/cribl/searchQuery.ts:6-7`).
- Preloaded: `ipython`, `matplotlib`, `pandas` (+numpy) — `kernel.worker.js:345-351`. On-import
  auto-load from lockfile (`kernel.worker.js:447-451`). `networkx` 3.4.2 in lockfile
  (`public/pyodide/pyodide-lock.json`), NOT preloaded but loads on `import networkx`. `pyod`,
  `chainsaw`, `python-evtx` not available.
- `.ipynb` codec: nbformat 4.5, `code`/`markdown` cells only; app metadata under
  `cell.metadata.notebook_app` (`code_folded`, `cell_enabled`, `run_condition`).

### 7. E2E
- New notebooks are auto-included in the `@examples-all` matrix
  (`e2e/specs/all-example-notebooks.spec.ts`). `@heavy` filename is hardcoded (line 38) — only for
  Anomaly today. `AI_Magic.ipynb` is allow-listed for intentional errors (lines 41-43).

### 8. Upstream sigmalineage-mcp logic (to reproduce in-notebook)
From `sigma_lineage.py` and `services/rarity.py`:
- **Process extraction:** Sysmon EID 1 and Security EID 4688 → normalized process records with
  `guid, pid, image, command_line, parent_guid, parent_pid, parent_image, parent_command_line,
  time, computer, user`.
- **Parent resolution:** prefer `ParentProcessGuid`; else match `(computer, parent_pid)` with the
  closest earlier `time` (`find_parent_key`).
- **Lineage trace:** from each Sigma hit, walk `parent_key` up to `levels` (default 5); render a
  text tree (root→hit with `└─` indent + `(HIT)` marker on level 0).
- **Rarity baseline (`rarity.py`):** three tuple families —
  `process_dst_port_protocol` (Image/DestPort/Protocol), `user_channel_event_id`
  (User/Channel/EventID), `url_host_process` (url/Computer/Image). Rare = `baseline_count <=
  max_baseline_count`; `rarity_score = 1/(baseline_count+1)`; sorted desc.

## Constraints derived
- Chainsaw + raw `.evtx` parsing cannot run in Pyodide → precompute Sigma hits + already-parsed
  process/telemetry rows into **hosted CSVs** and reproduce lineage + rarity in pandas/networkx.
- Load CSVs via `%%cribl_search externaldata` (Search workers, not Pyodide `fetch`) → no
  `config/proxies.yml` change needed.
- Register every hosted URL in `exampleDataUrls.ts` (contract test).
- Clear all cell outputs; keep the file < 1 MiB.
