# Solution Proposals: `%%cribl_search lang=english` query-only behavior

Context:
- Request: make `lang=english` output only the translated query (no search execution), and update example notebooks to explain/illustrate this.
- Research source: `research/2026-05-07-cribl-search-lang-english-query-only-research.md`

## Proposal 1 — Direct semantic switch for `lang=english` (chosen)

- Overview: keep magic syntax unchanged (`lang=english`) but change executor semantics so this mode stops after translation and surfaces generated KQL as the primary output. Users then run KQL using a follow-up `%%cribl_search lang=kql` cell (or plain KQL mode).
- Key changes:
  - Adjust executor control flow to short-circuit before `runCriblSearchJob` when `lang=english`.
  - Emit a stable, readable output contract for translated KQL.
  - Update all bundled notebooks that currently depend on english auto-run to a two-step pattern (translate -> run).
  - Update release notes/help text to match new behavior.
- Trade-offs:
  - **Pros:** exactly matches requested UX and keeps header syntax simple.
  - **Cons:** behavior change is breaking for users expecting auto-run in older notebooks.
- Validation:
  - Add executor tests proving no search call in english mode.
  - Validate example notebooks run end-to-end after adapting cells.
- Open questions:
  - Whether translated KQL should be emitted as `stream`, `application/json`, or custom MIME for best copy/paste UX.

## Proposal 2 — Introduce new option for translate-only, keep `lang=english` backward compatible

- Overview: preserve current `lang=english` translate-and-run semantics and add a new explicit mode/flag (for example `lang=english_only` or `translate_only=true`) for query-only output.
- Key changes:
  - Extend parser/editor completions for new parameter.
  - Keep existing notebooks mostly unchanged; add new illustrative cells where desired.
- Trade-offs:
  - **Pros:** avoids breaking existing behavior.
  - **Cons:** does not satisfy the request wording as directly, and increases API surface/mental overhead.
- Validation:
  - Add parser + executor tests for new parameter.
  - Ensure legacy english behavior remains covered.
- Open questions:
  - Naming and long-term support of dual english semantics.

## Chosen proposal

Proposal 1 is the stronger fit because it directly satisfies the requested semantics for `lang=english` and keeps notebook UX explicit: natural language prompt generation in one step, KQL execution in the next.
