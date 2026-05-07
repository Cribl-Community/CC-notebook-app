# JSON Output Rendering Research

## High-level summary

Notebook JSON outputs currently render through the MIME bundle path as plain `<pre>` text with basic pretty-printing and no structural interaction. The `application/json` renderer (`JsonMime`) parses + re-serializes JSON to 2-space indentation but does not support collapsing/expanding long payloads, key-level folding, or compact previews. Base output styling uses `white-space: pre-wrap` and `word-break: break-all`, which prevents horizontal overflow but can still create very tall cells for large JSON payloads. MIME data is normalized to strings during `.ipynb` parse/load, so renderer logic is responsible for any structured interpretation at display time. Existing tests cover MIME priority/security behavior but do not cover JSON rendering ergonomics.

## Detailed findings

### Current JSON render path

- MIME bundles are rendered via `MimeBundleView`, which picks the highest-rank registered renderer from `mimeRegistry`.
  - Reference: `src/features/notebook/ui/MimeBundleView.tsx:278-292`
  - Reference: `src/features/notebook/ui/mimeRegistry.ts:32-37`
- `application/json` is registered with rank 50 (above `text/plain`), so JSON payloads use a dedicated renderer when present.
  - Reference: `src/features/notebook/ui/MimeBundleView.tsx:265-269`
- `JsonMime` currently:
  - tries `JSON.parse(data)` and `JSON.stringify(parsed, null, 2)`,
  - falls back to raw text on parse failure,
  - returns a single `<pre className="nb-output-pre nb-mime-json">`.
  - Reference: `src/features/notebook/ui/MimeBundleView.tsx:153-162`

### Why long payloads stretch cells today

- Base output `<pre>` style wraps and aggressively breaks content:
  - `white-space: pre-wrap`
  - `word-break: break-all`
  - Reference: `src/index.css:998-1006`
- JSON-specific style adds background/padding but no max-height, no truncation, and no fold controls.
  - Reference: `src/index.css:1230-1236`
- Code cell output container is a simple vertical stack with no output-level virtualization/collapsing.
  - Reference: `src/features/notebook/ui/CodeCell.tsx:359-365`
  - Reference: `src/index.css:990-996`

### Data shape and constraints for renderer design

- In-memory MIME bundles are `Record<string, string>`, so JSON renderer receives serialized text and must parse to regain structure.
  - Reference: `src/platform/pyodide/types.ts:6-15`
- `.ipynb` parser normalizes object MIME values with `JSON.stringify`, ensuring JSON-like payloads can still reach renderer as strings.
  - Reference: `src/features/notebook/codec/ipynb.ts:36-54`
- Output records preserve full MIME bundles for `display_data` and `execute_result`; no output truncation is applied in reducer/executor.
  - Reference: `src/features/notebook/reducer/outputArea.ts:122-153`

### Existing UI patterns relevant to a foldable JSON view

- Interactive expand/collapse already exists in Cribl search output rows (stateful toggles, one-line summary + detailed section).
  - Reference: `src/features/cribl-search/ui/CriblSearchOutput.tsx:116-148`
  - Reference: `src/features/cribl-search/ui/CriblSearchOutput.tsx:186-205`
- Error detail UI uses `<details>` + `<summary>` for optional technical content, a reusable disclosure pattern for "show full JSON."
  - Reference: `src/features/notebook/ui/NotebookPage.tsx:351-355`

### Test baseline

- MIME tests currently validate renderer registration precedence, not JSON interaction/overflow behavior.
  - Reference: `src/features/notebook/ui/MimeBundleView.test.ts:5-49`
- Security tests cover markdown/html sanitization and scripted HTML iframe behavior; no JSON-specific assertions.
  - Reference: `src/features/notebook/ui/MimeBundleView.security.test.tsx:5-45`
