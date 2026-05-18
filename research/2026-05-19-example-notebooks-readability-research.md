# Example Notebooks Readability Research

## High-level summary

Bundled examples live in `public/Examples/*.ipynb`, are listed by `vite.examplesManifestPlugin.ts` into `manifest.json`, and opened from Welcome via `useExamples` + `useNotebookLibraryActions` (fetch, parse, new tab, kernel restart). Most feature-demo notebooks are already **magic-first** (very little Python: 4–28 code lines total). Readability pain is concentrated in three workflow/heavy notebooks: **`Anomaly_Detection_PyOD.ipynb`** (~591 code lines), **`Malware_Hash_Threat_Hunt.ipynb`** (~342), and **`Threat_Hunting_Playbook.ipynb`** (~103). Reduction levers are in-notebook only today: consolidate setup/helper cells, deduplicate imports and helpers, add preprocessing factories so per-detector cells stay tiny, and move prose into markdown—without changing app code or dropping Run All behavior. **Product decision:** Anomaly keeps **one code cell = one chart** per detector (18 cells); no registry/loop merge.

## Detailed findings

### 1) Discovery, metadata, and opening

- Manifest v2 is generated at build/dev time from `public/Examples/*.ipynb` plus static metadata in `vite.examplesManifestPlugin.ts:18-110`.
- Welcome renders title, summary, tags, level, runtime from manifest (`src/features/welcome/WelcomePage.tsx`).
- Opening copies the `.ipynb` into a new notebook tab; title comes from filename display label (`src/features/notebook/hooks/useNotebookLibraryActions.ts:272-292`, `examplesManifest.ts:16-18`).

### 2) Code volume by notebook (code cells only)

| Notebook | Code cells | Code lines (approx.) |
|----------|------------|----------------------|
| Anomaly_Detection_PyOD.ipynb | 25 | 591 |
| Malware_Hash_Threat_Hunt.ipynb | 25 | 342 |
| Threat_Hunting_Playbook.ipynb | 7 | 103 |
| Cribl_Search_Lookup_Magics.ipynb | 10 | 28 |
| Others (API, Search, AI, SDK, Tour, Visualisations, Incident) | 4–8 each | 4–8 |

### 3) Patterns that inflate Python

**Large shared setup cells**

- `Anomaly_Detection_PyOD.ipynb` cell 5 (~310 lines): constants, `plot_anomalies`, `run_detector`, sklearn adapter classes, neighbor grid for LSCP substitute (`def _score_hint_for_detector`, `SklearnNegLabelsToPyOD`, etc.).
- `Malware_Hash_Threat_Hunt.ipynb` cell 4 (~194 lines): env URL resolution, MalwareBazaar CSV parsing from Search `_raw`, `load_mb_ti_from_search`, `load_pe_imports_from_search`, `build_hunt_hits_df` pandas fallback.

**Repetitive execution cells**

- Anomaly: 18 detector sections; most are 3–7 lines of `title = '…'` + `run_detector(title, clf)` (PyOD models wrapped in try/except). A few sklearn substitutes need extra imports/pipelines (12–18 lines).
- Anomaly cells 11 and 13: duplicate `import plotly.graph_objects as go` (16 lines each) before detector blocks.
- Threat Hunting: `_pick_col` defined twice (cells 6 and 12); watchlist shaping (~27 lines) and timeline chart (~58 lines) are pure Python on Search DataFrames.

**Already minimal patterns (keep)**

- `%%cribl_search`, `%%cribl_api`, `%%cribl_save_search_lookup`, `%%cribl_delete_search_lookup` — documented in `criblSearchMagic.ts`, `criblApiMagic.ts`.
- `### Prompt:` AI blocks — used in `AI_Magic.ipynb`, `Cribl_Python_SDK.ipynb`, `Incident_Triage_Playbook.ipynb`.
- Magic-first examples: `Cribl_Search_Examples.ipynb`, `Cribl_API_Examples.ipynb`, `00_Getting_Started_Tour.ipynb` (4–8 code lines total).

### 4) Functional constraints (cannot remove without behavior change)

- Pyodide `micropip` installs (PyOD, Plotly pins) — required for Anomaly/Visualisations.
- Anomaly: sliding-window features, train/test split, per-detector Plotly charts with hover score hints — all depend on shared helpers.
- Malware: Search `externaldata` loads CSV; Python normalizes MB CSV quirks and provides pandas join fallback when KQL join returns no rows (`build_hunt_hits_df`).
- Threat Hunting: watchlist DataFrame must exist for `%%cribl_save_search_lookup`; chart needs column aliasing for timestats output.

### 5) Shared data URLs

- Canonical URLs in `src/domain/exampleDataUrls.ts` (`EXAMPLE_DATA_URLS`, contract tests).
- Malware setup duplicates raw GitHub URLs in Python with comment “keep in sync with exampleDataUrls.ts” — drift risk, not user-facing readability.

### 6) Validation surface

- `e2e/specs/all-example-notebooks.spec.ts` — manifest-driven **Run All** for every example (`@examples-all`).
- `e2e/specs/zz-anomaly-detection-example.spec.ts` — `@slow @heavy` Anomaly Run All (long timeouts).
- `npm test` includes ipynb codec tests; no per-cell content assertions for examples.
- Intentional errors allowed only for `AI_Magic.ipynb` (`ZeroDivisionError`, `KeyError`).

### 7) Prior art in repo

- `plans/2026-05-07-example-notebooks-awesomeness-*.md` and `research/2026-05-07-example-notebooks-awesomeness-research.md` focused on narrative/metadata/discovery, not Python line reduction.
- Examples are edited directly in `public/Examples/` (no generation script) per `plans/examples-welcome-tab.md`.
