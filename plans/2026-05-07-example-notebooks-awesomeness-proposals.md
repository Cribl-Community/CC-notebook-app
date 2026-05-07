# Example Notebooks Awesomeness Proposals

Context:
- Request: enhance bundled example notebooks for maximum "awesomeness" and add additional notebooks if justified.
- Research Source: `research/2026-05-07-example-notebooks-awesomeness-research.md`

## Proposal 1 — Content-first notebook overhaul (low-risk, fast)

- Overview: Keep app behavior unchanged and focus entirely on notebook assets. Refresh all existing notebooks with stronger narrative structure, clearer "run-this-next" progression, and better prompts; add 1-2 new high-impact notebooks for newcomer onboarding and realistic workflows.
- Key changes:
  - Update all five existing files under `public/Examples/*.ipynb` for consistency, progressive learning, and cleaner copy.
  - Add a "start-here" guided notebook (for first-time users) and an "incident triage" or "end-to-end observability story" notebook that combines search + API + visualization + AI.
  - Add cross-links between notebooks and a shared structure template (intro, prerequisites, checkpoints, stretch goals).
- Trade-offs:
  - Pros: no product-surface risk, no UI contract changes, immediate content value.
  - Cons: discovery remains filename-only; users still cannot see difficulty, runtime cost, or environment requirements before opening a notebook.
- Validation:
  - Open each notebook from Welcome and verify parse/run flow.
  - Spot-check key cells for syntax and magic-header correctness.
  - Confirm generated examples manifest includes new files and ordering is acceptable.
- Open questions:
  - Should a strict naming scheme be adopted (e.g., `00_`, `10_`) to guide order in the existing alphabetical picker?

## Proposal 2 — Curated onboarding pack with lightweight metadata support (recommended)

- Overview: Combine content overhaul with a small enhancement to examples discovery by introducing a versioned examples index (metadata-rich) that enables guided ordering and richer labels in Welcome, while preserving backward compatibility with current manifest behavior.
- Key changes:
  - Add new curated notebooks plus refresh existing notebooks as in Proposal 1.
  - Introduce `public/Examples/index.json` (or evolve manifest schema) with optional metadata per notebook: title, one-line summary, audience level, estimated runtime, and feature tags.
  - Update examples parsing/loading and Welcome rendering to show metadata (summary + tags + "recommended first"), while still supporting plain filename-only fallback.
- Trade-offs:
  - Pros: better first-run UX, stronger "wow" curation, scales as examples library grows.
  - Cons: small app-code surface change (manifest parser/hook/UI/tests), plus need to maintain metadata when adding notebooks.
- Validation:
  - Unit tests for parser fallback and metadata-aware parsing.
  - Hook/UI tests confirming metadata display and open behavior.
  - Manual open/run checks for all notebooks and new examples.
- Open questions:
  - Should metadata live in a separate index file or be inferred from per-notebook metadata fields?
  - Is "estimated runtime" best-effort static text or computed from presence of installs/network calls?

## Chosen approach

Choose **Proposal 2 — Curated onboarding pack with lightweight metadata support** because it improves both notebook quality and discoverability for new users, which better matches the "maximum awesomeness" goal than content refresh alone.
