# Implementation Plan: Example Notebooks Awesomeness

Chosen proposal: Curated onboarding pack with lightweight metadata support.

## Scope

Deliver a stronger newcomer experience by:
1. refreshing existing bundled notebooks for clearer guided workflows,
2. adding justified new notebooks that showcase end-to-end app value,
3. improving Welcome examples discovery with optional metadata (summary/tags/order) while preserving current filename-only compatibility.

Out of scope:
- Changing notebook execution engine behavior (`%%cribl_search`, `%%cribl_api`, AI runtime, kernel lifecycle).
- Shipping pre-executed notebooks with heavyweight outputs committed to repo.

## Design summary

1. Introduce a metadata-aware examples index format while retaining fallback support for the current `manifest.json` shape.
2. Extend examples parsing/loading and Welcome rendering to show richer context (title/summary/tags/recommended order).
3. Refresh all existing notebooks with a consistent "guided tutorial" structure and cross-linking.
4. Add two new notebooks aimed at first-time user delight and realistic observability workflows.
5. Add/adjust tests for parser, hook/UI behavior, and smoke stubs.

## Ordered implementation sub-tasks

### 1) Define metadata-aware examples manifest/index contract

Affected files:
- `src/features/examples/examplesManifest.ts`
- `src/features/examples/examplesManifest.test.ts`
- `vite.examplesManifestPlugin.ts`
- (new) `public/Examples/index.json` generation target OR evolved `manifest.json` schema

Steps:
- Define schema that supports both legacy filename arrays and richer notebook descriptors (`filename`, `title`, `summary`, `tags`, `level`, `estimatedRuntime`, `recommendedOrder`).
- Keep parser backward compatible with v1 manifest (`{ version: 1, notebooks: string[] }`).
- Update Vite generation logic to emit deterministic ordering and include descriptor stubs.

Acceptance criteria:
- Existing setups with filename-only data continue to work unchanged.
- Metadata-aware format is parsed safely with validation and fallback behavior.

### 2) Extend examples loading hook and Welcome examples presentation

Affected files:
- `src/features/examples/useExamples.ts`
- `src/features/examples/useExamples.test.tsx`
- `src/features/welcome/WelcomePage.tsx`
- `src/index.css`
- `src/testing/appSmoke.test.tsx`

Steps:
- Update hook state shape to carry per-notebook metadata while preserving selection/open behavior.
- Render richer example rows in Welcome (title + concise description + tags/level/time hint).
- Keep current open action semantics (open copy in new tab).
- Update smoke and hook tests to match new payload shape and fallback paths.

Acceptance criteria:
- Welcome examples remain functional when only legacy manifest is present.
- With metadata present, users can see context before opening notebooks.
- Open action still calls existing `onOpenExample(filename)`.

### 3) Refresh all existing bundled notebooks with a shared tutorial pattern

Affected files:
- `public/Examples/AI_Magic.ipynb`
- `public/Examples/Cribl_API_Examples.ipynb`
- `public/Examples/Cribl_Python_SDK.ipynb`
- `public/Examples/Cribl_Search_Examples.ipynb`
- `public/Examples/Visualisations.ipynb`

Steps:
- Apply a consistent structure in each notebook: "What you will learn", prerequisites/environment notes, step-by-step run order, and "next notebook" links.
- Tighten copy and prompts for clearer outcomes; remove redundant or noisy sections.
- Ensure each notebook has at least one "success checkpoint" cell users can verify quickly.

Acceptance criteria:
- Existing examples read coherently and follow a consistent learning flow.
- Magic headers and sample code remain executable in current runtime assumptions.

### 4) Add two new high-impact examples for first-time wow factor

Affected files:
- (new) `public/Examples/00_Getting_Started_Tour.ipynb` (or equivalent starter name)
- (new) `public/Examples/Incident_Triage_Playbook.ipynb` (or equivalent workflow name)
- `public/Examples/index.json`/manifest output

Steps:
- Create a start-here notebook that guides first run from zero to visible output quickly.
- Create a realistic workflow notebook that combines search/API data, visualization, and optional AI-assisted analysis.
- Cross-link to deeper notebooks for continuation paths.

Acceptance criteria:
- New users can open the starter notebook and reach a concrete "wow" output in a few cells.
- New files appear automatically in generated examples listing and open correctly.

### 5) Align naming/order and maintainability conventions

Affected files:
- `public/Examples/*`
- `scripts/write-examples-ipynb.mjs` (if retained)
- `plans/examples-welcome-tab.md` (if still canonical for examples workflow)

Steps:
- Decide and apply ordering convention (`00_`, `10_`, etc. or metadata order field) so the picker shows intentional progression.
- Either modernize or retire stale generation script references that still emit legacy notebook names.
- Document the new "how to add an example notebook" workflow briefly.

Acceptance criteria:
- Examples order is deliberate and stable across dev/build.
- Repo no longer points contributors to outdated example generation outputs.

### 6) Validate end-to-end behavior

Affected files:
- Tests in `src/features/examples/*`, `src/testing/appSmoke.test.tsx`
- Manual verification via app UI

Steps:
- Run example-related unit tests and app smoke tests.
- Manually verify: Welcome renders metadata, selection/open works, each updated notebook loads and starts cleanly.
- Confirm no lint/type/test regressions in touched files.

Acceptance criteria:
- Test suite passes for affected areas.
- Manual checks confirm improved onboarding and discoverability experience.

## Risks and mitigations

- Risk: metadata schema changes can break legacy environments.
  - Mitigation: explicit backward-compatible parser + tests for both schema variants.
- Risk: notebook copy/content changes drift from real runtime behavior.
  - Mitigation: manual run-through of key cells in each notebook during validation.
- Risk: too many setup/install steps reduce perceived "awesomeness."
  - Mitigation: prioritize fast-success path in starter notebook and clearly mark optional heavy cells.
