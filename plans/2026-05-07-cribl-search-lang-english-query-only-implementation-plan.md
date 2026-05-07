# Implementation Plan: `%%cribl_search lang=english` query-only mode

## Context

Change `%%cribl_search lang=english` from "translate then run search" to "translate only and output generated KQL", and update bundled examples to teach and use this pattern.

## Requirements

- Functional:
  - `lang=english` must not execute `runCriblSearchJob`.
  - `lang=english` must output translated KQL in a clear, reusable format.
  - Existing `lang=kql` behavior must remain unchanged.
  - Example notebooks that currently rely on english auto-run must be updated to explicit translate-then-run workflows.
- Non-functional:
  - Preserve robust error reporting for translation failures.
  - Keep notebook output readable and consistent with existing MIME rendering patterns.
  - Maintain/expand test coverage around executor behavior.

## Research Summary

See: `research/2026-05-07-cribl-search-lang-english-query-only-research.md` and `plans/2026-05-07-cribl-search-lang-english-query-only-proposals.md`.

## Chosen Approach

Use the direct semantic switch: `lang=english` becomes translate-only, implemented in executor control flow with supporting test and examples/documentation updates.

## Ordered sub-tasks

1. **Executor semantics update (translate-only short-circuit)**
   - Scope:
     - `src/features/notebook/executor/criblSearchExecutor.ts`
     - `src/features/cribl-search/criblSearchCellRunner.ts` (if output helpers are needed)
   - Plan:
     - Keep parser contract (`lang=english`) unchanged.
     - After optional Jinja render and translation, emit generated KQL output and finish cell successfully.
     - Skip search progress/job creation/completion table path in english mode.
     - Ensure local-dev fallback behavior is explicit (no misleading "as-is search" path).
   - Acceptance criteria:
     - No `runCriblSearchJob` call when `lang=english`.
     - Cell ends in `FINISH_CELL` with translated query visible to users.
     - Existing `lang=kql` cells continue to run search and materialize dataframes.

2. **Executor test coverage for new english contract**
   - Scope:
     - `src/features/notebook/executor/criblSearchExecutor.test.ts`
   - Plan:
     - Add test that verifies translation happens and search job does not run in english mode.
     - Add test for translation failure/error path with user-visible message.
     - Add test that validates emitted output format for generated KQL.
   - Acceptance criteria:
     - Tests fail before implementation and pass after.
     - Assertions explicitly cover "no search call" behavior.

3. **Notebook updates for translate-then-run pattern**
   - Scope:
     - `public/Examples/Cribl_Search_Examples.ipynb` (primary)
     - `public/Examples/00_Getting_Started_Tour.ipynb`
     - `public/Examples/AI_Magic.ipynb`
     - `public/Examples/Incident_Triage_Playbook.ipynb`
   - Plan:
     - Replace english cells that previously expected immediate dataframe results with two-step sequences:
       - Step A: `lang=english` to generate KQL.
       - Step B: `lang=kql` (or default KQL mode) using generated query to produce dataframe.
     - Add markdown explanation of new behavior and copy/paste/run guidance.
   - Acceptance criteria:
     - All notebooks execute successfully with their documented flow.
     - No downstream dataframe usage depends on old english auto-run semantics.

4. **User-facing documentation alignment**
   - Scope:
     - `src/features/welcome/releaseNotes.ts`
     - (Optional) any inline help strings tied to english-mode wording
   - Plan:
     - Update release note language so english mode is described as query generation.
     - Keep historical wording accurate for prior versions, while adding a new current-version highlight for changed behavior.
   - Acceptance criteria:
     - No remaining current-version text claims english mode auto-runs search.

5. **Validation and regression pass**
   - Scope:
     - Targeted tests + notebook sanity run.
   - Plan:
     - Run `npm test` (or focused test file) for executor/parser areas.
     - Manually sanity-check at least one updated notebook path end-to-end (translate cell then KQL run cell).
   - Acceptance criteria:
     - Targeted tests pass.
     - Example notebook workflow is coherent for new users.

## Testing plan

- Unit tests:
  - `criblSearchExecutor.test.ts` for english translate-only behavior.
  - Optional parser/editor tests only if syntax/help changes.
- Manual:
  - Open updated examples from Welcome tab and execute modified english flow cells.
  - Verify generated KQL is readable and reusable in next cell.

## Rollout / compatibility notes

- This is a behavioral change for existing notebooks using `lang=english` as auto-run.
- Mitigate via clear release note entry and updated bundled examples that demonstrate the new pattern immediately.

## Open questions

- Should generated KQL be emitted only as stdout text or additionally as structured MIME for richer UI affordances (copy button/future actions)?
