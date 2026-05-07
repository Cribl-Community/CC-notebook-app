# Task 1: Make `lang=english` translate-only in executor

## Goal

Change `%%cribl_search` english mode so it outputs generated KQL and does not execute a search job.

## Affected files

- `src/features/notebook/executor/criblSearchExecutor.ts`
- `src/features/cribl-search/criblSearchCellRunner.ts` (if helper updates needed)

## Acceptance criteria

- `runCriblSearchJob` is not called for `lang=english`.
- Cell emits generated KQL and completes successfully.
- `lang=kql` flow remains unchanged.
