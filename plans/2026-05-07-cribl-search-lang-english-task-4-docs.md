# Task 4: Align release notes and user-facing wording

## Goal

Ensure current documentation matches `lang=english` translate-only behavior.

## Affected files

- `src/features/welcome/releaseNotes.ts`
- Any nearby helper text that currently implies english auto-executes search

## Acceptance criteria

- Current-version notes describe english mode as query generation.
- No active text claims english mode immediately runs Search jobs.
