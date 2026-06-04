---
name: reppit
description: Runs the RePPIT workflow (Research → Propose → Plan) for a topic, feature, or issue—thorough codebase research, up to two solution proposals, then a detailed implementation plan without coding. Use when the user invokes /reppit, asks for RePPIT, or wants research-then-proposals-then-plan before implementation.
---

# RePPIT (`/reppit`)

Run **Research → Propose → Plan** in a **single response**. Input: a topic, feature description, or issue identifier.

Do **not** implement code in this workflow. Stop after the plan.

## Start

At the very beginning, check existing workspace todos in the conversation (or from the last **`TodoWrite`**). If there are RePPIT-related todos from a prior session, summarize their status and continue from the last incomplete phase instead of restarting from scratch. **Cursor:** use the **`TodoWrite`** tool (`merge: true` / `merge: false`, statuses `pending` | `in_progress` | `completed` | `cancelled`) — not `TaskList` / `TaskUpdate` / `TaskCreate`.

## Phase 1 — Research

<!-- PHASE:research -->

Research the codebase thoroughly. When working in this repository, follow the behavior contract and steps in [`.claude/commands/research-codebase.md`](../../../.claude/commands/research-codebase.md) if that file exists.

Deliver a **brief findings summary**, then move to Phase 2 without re-reading the same files unnecessarily.

## Phase 2 — Propose

<!-- PHASE:propose -->

From the research, produce **up to two** solution approaches. Follow [`.claude/commands/make-proposals.md`](../../../.claude/commands/make-proposals.md) if present (research-backed proposals, trade-offs, validation).

Present both briefly, **choose the stronger** (or the one that better matches project conventions), name the choice, then continue to Phase 3.

## Phase 3 — Plan

<!-- PHASE:plan -->

Write a detailed implementation plan for the **chosen** proposal. Follow [`.claude/commands/make-plan.md`](../../../.claude/commands/make-plan.md) if present (scope, ordering, no code). If [`.claude/design_doc_template.md`](../../../.claude/design_doc_template.md) exists, align section depth with it when helpful.

Break work into **concrete sub-tasks**. Present the **full plan** clearly.

**End here.** Do not implement, and do not ask whether to proceed—only deliver the plan.

## Persistence after the plan

After presenting the plan, call **`TodoWrite`** so each sub-task is tracked: stable `id`, `content` (short title + acceptance criteria + affected files/paths), `status: "pending"` for incomplete work. Use `merge: false` for a fresh list from this plan, or `merge: true` to update existing ids. This keeps continuity across sessions when the tool is available.

## Rules

- At the **start of each phase**, output the phase marker alone on its own line, exactly: `<!-- PHASE:research -->`, `<!-- PHASE:propose -->`, or `<!-- PHASE:plan -->`.
- Complete **all three phases** in **one** assistant response.
- **Do not** start implementing. Stop after the plan.
- **Keep context between phases**—do not re-read files already in context unless needed to cite paths or verify a detail.
