# Example Notebooks Readability Proposals

## Solution Proposals

Context:
- Request: Make example notebooks more readable by reducing Python code without losing functionality.
- Research Source: `research/2026-05-19-example-notebooks-readability-research.md`

## Proposal 1 — Content-only notebook slimming (recommended)

- Overview: Edit `public/Examples/*.ipynb` in place. Consolidate setup/helpers, deduplicate imports, slim detector cells via **preprocessing factories** while keeping **one cell = one chart** (Anomaly), and slimmer chart/prompt cells (playbooks). Shift explanation into markdown. No app/platform changes.
- Key changes:
  - **Anomaly:** One compressed preprocessing cell (include clf factory helpers); single Plotly import; **keep 18 separate detector cells** (one chart each); trim docstrings/comments that repeat markdown.
  - **Malware:** Shorten setup (group helpers, drop redundant prints); keep KQL + lookup path as primary; minimal one-liners where Python only bridges Search → lookup.
  - **Threat Hunting:** One upfront mini-helper cell (`_pick_col`); shorten watchlist + chart cells; prefer `display()`/fewer branches.
  - **Incident / others:** Replace verbose matplotlib blocks with `### Prompt:` where it matches existing AI_Magic pattern; light copy pass only on already-lean notebooks.
- Trade-offs:
  - Pros: Zero product risk; matches “examples are assets” convention; E2E Run All unchanged in spirit.
  - Cons: Line reduction on Anomaly is capped by 18 per-detector cells; largest savings must come from the preprocessing cell (~150–250 lines after trim) unless adapters move out-of-band later.
- Validation:
  - `npm test` (codec/manifest).
  - Local Run All on edited notebooks in dev/staging.
  - `npm run e2e:examples` (+ `e2e:examples:all` if Anomaly structure changes materially).
- Open questions:
  - Malware: keep pandas join fallback or document KQL-only path?
- Resolved:
  - **Anomaly:** maintain **one code cell = one chart** per detector (no registry loop).

## Proposal 2 — Shared example helper module (platform or example-data)

- Overview: Extract repeated utilities (`_pick_col`, MB CSV parsing, anomaly `run_detector` stack) into a versioned Python module loaded once per notebook (e.g. `micropip.install` from `notebook-app-example-data` raw URL, or Pyodide bootstrap under `src/platform/pyodide/`).
- Key changes:
  - New `examples_helpers.py` (location TBD) + thin notebook cells: `from examples_helpers import pick_col, run_anomaly_detector, …`.
  - Notebooks shrink to magics + 1–2 import lines per section.
- Trade-offs:
  - Pros: Maximum line reduction; fixes URL/helper drift across hunts.
  - Cons: New coupling (proxies, Pyodide import path, versioning); outside “content-only” scope; harder for readers to see full logic inline; requires platform or external packaging decision.
- Validation:
  - Unit tests for helper module (if in repo); kernel load test; full E2E matrix.
- Open questions:
  - Helpers in app bundle vs example-data repo vs Pyodide bootstrap?

## Recommendation

**Proposal 1** — aligns with current maintenance model, avoids new runtime dependencies, and targets the three notebooks that dominate code volume. Revisit Proposal 2 only if preprocessing cells remain too large after consolidation.
