# JSON Output Rendering Proposals

Context:
- Request: Render cell JSON payloads in an aesthetically pleasing way and show long payloads in a semi-folded form so cells do not stretch excessively.
- Research Source: `research/2026-05-07-json-output-rendering-research.md`

## Proposal 1 — Progressive JSON viewer in `MimeBundleView` (recommended)

- Overview: Replace the current plain `<pre>` JSON renderer with a structured viewer that defaults to a compact "semi-folded" presentation for large payloads, while still allowing full expansion on demand. Keep the integration localized to the `application/json` MIME renderer and output styling.
- Key Changes:
  - Add a dedicated JSON viewer component (inline in `MimeBundleView.tsx` or extracted to `JsonMimeView.tsx`) that:
    - parses JSON safely,
    - computes size/complexity thresholds,
    - renders compact preview for long payloads (collapsed nested nodes or clamped initial view),
    - supports expand/collapse controls.
  - Update JSON CSS classes with max-height, gradient/fade affordance, and expanded state styling.
  - Add focused tests for compact vs expanded states and parse-fallback behavior.
- Trade-offs:
  - Pros: Delivers requested UX directly, keeps change surface small, preserves existing MIME architecture.
  - Cons: Adds view-state logic in notebook UI and needs careful threshold tuning for readability/perf.
- Validation:
  - Unit/UI tests for short JSON, long JSON, malformed JSON, and expand/collapse interactions.
  - Manual check with large nested payload output in code cells.
- Open Questions:
  - Should "semi-folded" default be based on line count, character count, nesting depth, or a combination?
  - Should expand state reset on re-render/new output, or persist per output instance?

## Proposal 2 — Generic output clamp + optional JSON enhancement

- Overview: Implement a generic "clamped output with expand" container for all text-like outputs (including JSON), then add light JSON-specific formatting inside that shared shell.
- Key Changes:
  - Introduce reusable output clamp component around `<pre>` outputs.
  - Apply it to `text/plain`, stream outputs, tracebacks, and JSON.
  - Keep JSON renderer mostly as-is (pretty print only) with container-level expansion.
- Trade-offs:
  - Pros: Broadly improves long-output ergonomics across notebook outputs with one mechanism.
  - Cons: Larger behavior change scope than requested and risks altering non-JSON workflows.
- Validation:
  - Regression tests across stream/plain/error outputs plus JSON.
- Open Questions:
  - Is global output clamping acceptable for existing users who rely on full inline text visibility?

## Chosen approach

Choose **Proposal 1 — Progressive JSON viewer in `MimeBundleView`** because it targets the user request precisely (JSON aesthetics + semi-folded long payload behavior) with minimal cross-feature risk and strong alignment with the existing MIME renderer architecture.
