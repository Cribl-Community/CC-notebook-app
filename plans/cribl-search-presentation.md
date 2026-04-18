# Plan: `%%cribl_search` presentation improvements

Parent tracker for the RePPITS workflow (Research → Propose → Plan).

## Requirements (from product)

- Results table resembling Cribl Search: **Time** + **Event** columns, expandable row for field-level message details.
- **Fields** sidebar: filter + field names with numeric counts (facet-style).
- **Do not load large datasets**: cap at **first 20** result rows for UI and Pyodide DataFrame payload.
- **Status**: progress bar finishing with **green check + “completed”** or **red cross + “failed”**.
- Surface **column names** and **record counts** (displayed vs total when API provides total).

## Chosen approach

See chat: **Structured `CellOutput` + `REPLACE_OUTPUT_AT` + dedicated React views** (Proposal 1).

## Sub-tasks

1. **searchJobs API contract** — `maxRows`, single results page, optional total from status/results; structured progress callbacks.
2. **Reducer + types** — extend `CellOutput`, add replace action, ipynb serialize/parse for round-trip.
3. **UI components** — progress, table, details, sidebar; theme tokens from `index.css`.
4. **NotebookPage integration** — wire `%%cribl_search` run path; update tests/stub.
