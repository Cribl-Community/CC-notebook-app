Continue the RePPIT workflow. The plan has been approved — now execute Implement → Test → Secure.

## Phase 4 — Implement (per sub-task)

<!-- PHASE:implement -->

## Task Tracking

Before starting implementation:
1. Call `TaskList` to see all current tasks and their statuses.
2. Identify the next `open` task to work on.
3. If all tasks are already `completed`, skip to Phase 5 (Test).

For each sub-task in the approved plan, in order:

1. Call `TaskUpdate` to set the task status to `in_progress`.
2. Follow `.claude/commands/implement.md` if available.
3. After implementing each sub-task, commit the changes.
4. Call `TaskUpdate` to set the task status to `completed`.
5. Move to the next open task.

When all sub-tasks are implemented, proceed to Phase 5.

## Phase 5 — Test

<!-- PHASE:test -->

Follow `.claude/commands/review-code.md` to review all changes if available.

- If review has action items → fix them and re-review.
- Loop (implement fix → re-test) until the review is clean.
- When clean, proceed to Phase 6.

## Rules
- Implement all sub-tasks from the approved plan.
- All phases proceed automatically — do not wait for user input.
- Keep all context from the planning conversation.
