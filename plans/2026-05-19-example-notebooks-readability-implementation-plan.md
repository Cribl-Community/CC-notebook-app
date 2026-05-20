# Example Notebooks Readability — Implementation Plan

**Chosen approach:** Proposal 1 (content-only notebook slimming)  
**Research:** `research/2026-05-19-example-notebooks-readability-research.md`  
**Proposals:** `plans/2026-05-19-example-notebooks-readability-proposals.md`

## Goals

- Reduce visible Python in bundled examples while preserving Run All success, teaching intent, and feature coverage (Search, API, lookups, PyOD, charts, AI prompts).
- Target ≥35% code-line reduction on the three heavy notebooks; no regression on magic-first examples.

## Non-goals

- New manifest fields, Welcome UI changes, or Pyodide bootstrap modules.
- Removing optional env overrides (MalwareBazaar auth, custom CSV URLs).
- Changing E2E tagging/timeouts unless Run All duration shifts materially.

## Design constraint (Anomaly)

**Keep one code cell = one chart per detector** — all 18 detector sections remain separate runnable cells (no registry loop, no “run all detectors” cell). Line reduction comes from shared preprocessing, helper factories, and deduped imports only.

## Implementation order

### Task 1 — Baseline and acceptance metrics

**Files:** `public/Examples/*.ipynb` (read-only audit)

**Steps:**

1. Record per-notebook: code cell count, total code lines, cells with `def`/`class`.
2. Save baseline in PR description or a one-line table in commit message.

**Acceptance:** Baseline table for all 11 notebooks; identifies Anomaly, Malware, Threat Hunting as primary targets.

---

### Task 2 — `Anomaly_Detection_PyOD.ipynb`

**Files:** `public/Examples/Anomaly_Detection_PyOD.ipynb`

**Steps:**

1. **Setup cell:** Keep micropip pins and warning filters; remove redundant comments already covered in markdown.
2. **Preprocessing cell:** Tighten adapter classes (combine trivial wrappers, shorten `_score_hint_for_detector` map); keep `run_detector`, `plot_anomalies`, `make_data_sampling`, train/test split logic intact. Add small **factory helpers** here for repeated sklearn/PyOD constructions (e.g. `abod_clf()`, `iforest_clf()`, pipeline builders) so detector cells stay minimal.
3. **Remove duplicate Plotly imports** (cells that only re-import `go`); rely on preprocessing imports.
4. **Detector sections (18 cells unchanged in structure):**
   - Keep markdown H3 + **one code cell per detector** (one chart each when run).
   - Shrink each cell to `title = '…'` + `run_detector(title, <factory or clf>)` (or existing try/except wrapper for PyOD imports); move multi-line pipeline setup into preprocessing factories.
   - Do **not** merge detectors into a registry or loop cell.
5. Leave “How to run” markdown as step-through per detector (no registry wording).
6. Verify `%%cribl_search` externaldata cell and materialize/train cells unchanged in behavior.

**Acceptance:**

- **18 detector code cells** remain (one chart per cell).
- Code lines ≤ ~480 (from ~591); primary savings in preprocessing + deduped imports, not cell merge.
- Run All still produces Plotly output for all 18 slots (skip messages unchanged on failure).
- `npm run e2e:slow:all` / Anomaly spec passes on staging when run.

---

### Task 3 — `Malware_Hash_Threat_Hunt.ipynb`

**Files:** `public/Examples/Malware_Hash_Threat_Hunt.ipynb`, `src/domain/exampleDataUrls.ts` (comments only if URL constants referenced)

**Steps:**

1. **Setup cell:** Import `EXAMPLE_DATA_*` pattern via minimal constants aligned with `exampleDataUrls.ts` (or generate URLs from a single base + path tuple list); collapse `_mb_csv_lines_from_search` / `_parse_mb_csv_lines` where safe.
2. Replace verbose `print` diagnostics with one summary line or markdown prerequisites table.
3. Keep Search magics, lookup save/load, KQL hunt join as primary path.
4. Retain `build_hunt_hits_df` fallback but document in markdown when it triggers; shorten implementation if branches overlap with KQL result.
5. **Chart cell:** Consider `### Prompt:` for secondary chart if a static matplotlib block is >25 lines; keep at least one explicit matplotlib example for offline teaching.
6. Ensure cleanup magics unchanged.

**Acceptance:**

- Code lines ≤ ~220 (from ~342).
- Default Run All (hosted CSVs, no auth) still completes; join produces hits or documented fallback path.
- `exampleDataUrls.contract.test.ts` still passes (URLs unchanged).

---

### Task 4 — `Threat_Hunting_Playbook.ipynb`

**Files:** `public/Examples/Threat_Hunting_Playbook.ipynb`

**Steps:**

1. Add a single **Helpers** code cell at top (after prerequisites markdown): `_pick_col` only.
2. Remove duplicate `_pick_col` from watchlist and chart cells.
3. Shorten watchlist shaping (use `_pick_col` + chained rename/head).
4. Shorten chart cell: assume standard timestats columns when present; keep clear error if empty.
5. No change to Search/lookup magic queries unless alias simplification is provably equivalent.

**Acceptance:**

- Code lines ≤ ~65 (from ~103).
- Run All still creates lookup, join, and timeline chart.

---

### Task 5 — Light pass on remaining examples

**Files:** `public/Examples/Incident_Triage_Playbook.ipynb`, optionally `Visualisations.ipynb`, `Cribl_Python_SDK.ipynb`

**Steps:**

1. **Incident:** Replace matplotlib cell with `### Prompt:` chart block (mirror `AI_Magic.ipynb`); keep one `print`/`head` inspection cell.
2. **Already lean notebooks** (`Cribl_Search_Examples`, `Cribl_API_Examples`, `AI_Magic`, `00_Getting_Started_Tour`, `Cribl_Search_Lookup_Magics`): copy-edit markdown only; do not churn code cells.
3. Confirm `vite.examplesManifestPlugin.ts` summaries still accurate if “How to run” steps change.

**Acceptance:** No increase in code lines on lean notebooks; Incident code lines ≤ 4.

---

### Task 6 — Validation and docs touch-up

**Files:** `e2e/specs/all-example-notebooks.spec.ts` (only if intentional error names change), `docs/E2E_STAGING.md` (only if run steps change)

**Steps:**

1. `npm test`
2. Manual Run All in dev for edited notebooks (minimum: Threat Hunting, Malware, Incident; Anomaly if not running full E2E).
3. `npm run e2e:examples` after staging deploy of branch (or local smoke).
4. If Anomaly cell structure or outputs change, run `npm run e2e:slow:all` once.

**Acceptance:** Tests green; no new critical notebook errors in E2E; manifest regenerates on build.

## Risk register

| Risk | Mitigation |
|------|------------|
| Anomaly line budget tight with 18 cells | Push repetition into preprocessing factories; trim comments/docstrings |
| Malware fallback join removed by mistake | Keep `build_hunt_hits_df` until KQL join proven on staging |
| URL drift vs `exampleDataUrls.ts` | Use shared path constants in setup comment + contract test |
| E2E timeout on Anomaly | Run heavy spec before merge; avoid extra micropip installs |

## Success metrics

| Notebook | Baseline code lines | Target |
|----------|---------------------|--------|
| Anomaly_Detection_PyOD | 591 | ≤ 480 (18 one-chart cells retained) |
| Malware_Hash_Threat_Hunt | 342 | ≤ 220 |
| Threat_Hunting_Playbook | 103 | ≤ 65 |
| Others | 4–28 | No increase |
