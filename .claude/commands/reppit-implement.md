Continue the RePPIT workflow. The plan has been approved — now execute Implement → Test → Secure.

## Phase 4 — Implement (per sub-task)

<!-- PHASE:implement -->

## Task tracking (Cursor)

Use **`TodoWrite`** (not `TaskList` / `TaskUpdate`). Each todo has `id`, `content`, and `status`: `pending` | `in_progress` | `completed` | `cancelled`. Use `merge: true` to update by `id` without dropping other items; use `merge: false` only when replacing the whole list.

Before starting implementation:
1. Read current todos from the conversation (or the last `TodoWrite` result). If none exist yet, seed them from the approved plan with `TodoWrite(merge: false, todos: [...])` using stable `id`s per sub-task.
2. Pick the next item with status `pending` (or equivalent “open” work).
3. If everything is already `completed`, skip to Phase 5 (Test).

For each sub-task in the approved plan, in order:

1. **`TodoWrite(merge: true, …)`** — set that todo’s `status` to `in_progress` (and keep `content` / `id` unchanged).
2. Follow `.claude/commands/implement.md` if available.
3. After implementing each sub-task, commit the changes.
4. **`TodoWrite(merge: true, …)`** — set the same todo’s `status` to `completed`.
5. Move to the next `pending` todo.

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
