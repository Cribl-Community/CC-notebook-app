# Task 2: Add executor tests for english query-only contract

## Goal

Lock in new behavior with explicit unit tests.

## Affected files

- `src/features/notebook/executor/criblSearchExecutor.test.ts`

## Acceptance criteria

- Test verifies translation is called and search job is not called in `lang=english`.
- Test verifies user-visible generated KQL output contract.
- Test verifies translation failures still dispatch error state and clear messaging.
