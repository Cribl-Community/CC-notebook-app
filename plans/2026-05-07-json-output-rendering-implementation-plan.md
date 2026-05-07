# Implementation Plan: JSON Payload Output Rendering

Chosen proposal: Progressive JSON viewer in `MimeBundleView`.

## Scope

Implement improved JSON output rendering in notebook cells so:
- JSON payloads are visually polished and readable by default.
- Long payloads render in a semi-folded compact form that avoids excessive cell height.
- Users can expand to inspect full payload contents when needed.

Out of scope:
- Global output-clamping behavior for non-JSON output types.
- Changes to kernel protocol or notebook data model.

## Design summary

1. Introduce a dedicated JSON MIME viewer that distinguishes short vs long payloads.
2. Keep current JSON parse + pretty-print behavior as baseline formatting.
3. Add a compact default presentation for long payloads (threshold-based), with explicit expand/collapse controls.
4. Add JSON-specific visual styling (container, compact state, expanded state) without changing non-JSON output CSS.
5. Add tests covering parser fallback and compact/expanded interactions.

## Ordered implementation sub-tasks

### 1) Define JSON viewer behavior contract and thresholds

Affected files:
- `src/features/notebook/ui/MimeBundleView.tsx`
- (optional) new helper file under `src/features/notebook/ui/`

Steps:
- Define what qualifies as "long payload" (line count / character count / nested complexity).
- Define compact representation rules (for example, collapsed nested nodes and/or clamped preview block).
- Define expand/collapse interaction semantics and accessibility labels.

Acceptance criteria:
- Behavior contract is explicit enough to implement deterministically.
- Compact and expanded states are clearly distinguishable for users and tests.

### 2) Implement structured JSON MIME viewer

Affected files:
- `src/features/notebook/ui/MimeBundleView.tsx`
- optional extraction: `src/features/notebook/ui/JsonMimeView.tsx`

Steps:
- Replace current `JsonMime` plain `<pre>` rendering with componentized viewer logic.
- Parse JSON once, pretty-print for display, and keep malformed JSON fallback unchanged.
- Add component state for compact/expanded rendering on long payloads.
- Keep `application/json` MIME registration in existing renderer pipeline.

Acceptance criteria:
- Small JSON payloads render fully without extra interaction.
- Large JSON payloads render in compact semi-folded mode by default.
- Users can expand and collapse long payloads without affecting other outputs.
- Invalid JSON strings still render as raw text (no crash).

### 3) Add JSON-specific UI styling for compact and expanded states

Affected files:
- `src/index.css`

Steps:
- Extend `.nb-mime-json` styling for clearer structure (surface, spacing, typography).
- Add classes for compact mode (height clamp/fade/control row) and expanded mode.
- Ensure styles remain theme-variable driven and consistent with existing notebook palette tokens.

Acceptance criteria:
- Compact mode prevents oversized vertical output blocks.
- Expanded mode reveals full content without clipping.
- Styling remains consistent with current output visual language.

### 4) Add/extend tests for JSON rendering behavior

Affected files:
- `src/features/notebook/ui/MimeBundleView.test.ts`
- optional new JSON-focused test file under `src/features/notebook/ui/`

Steps:
- Add tests for renderer behavior with short JSON payloads.
- Add tests for long payload compact defaults and expand/collapse interaction.
- Add tests for parse-failure fallback rendering.

Acceptance criteria:
- Automated tests cover the primary happy path and edge cases.
- Existing MIME priority/security tests continue to pass.

### 5) Validate end-to-end notebook UX and guard regressions

Affected files:
- none required (verification task)

Steps:
- Run targeted notebook UI tests and full test suite.
- Manually verify with representative large JSON outputs (nested objects and long arrays) in a code cell.
- Confirm non-JSON MIME outputs are unchanged.

Acceptance criteria:
- `npm test` passes for touched areas.
- Long JSON payloads no longer stretch cells excessively in default view.
- Non-JSON output rendering behavior remains stable.

## Risks and mitigations

- Risk: compact thresholds hide too much data for medium payloads.
  - Mitigation: choose conservative defaults and keep one-click expand.
- Risk: JSON viewer interaction introduces rendering overhead on very large payloads.
  - Mitigation: parse once, memoize derived display strings, and keep compact rendering lightweight.
- Risk: CSS changes accidentally affect other output types.
  - Mitigation: scope new styles to JSON-specific class names only.
