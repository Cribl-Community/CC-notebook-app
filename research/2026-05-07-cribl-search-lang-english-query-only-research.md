# Research: `%%cribl_search lang=english` query-only mode

## High-level summary

`%%cribl_search` already supports `lang=english`, but today it translates English text to KQL and then immediately executes a Search job. The parser and editor already recognize the `lang` parameter, so the behavior change is centered in the executor path and user-facing examples/docs. Current bundled notebooks use `lang=english` to materialize dataframes, so changing semantics to "translate only" will break those flows unless notebooks are updated to run the generated KQL separately. Rendering support for JSON payloads is already handled by the generic MIME JSON renderer, including compact/expand behavior for long payloads. Test coverage exists for parser behavior and general executor success paths, but there is no executor test that asserts the current `lang=english` execution semantics, which creates room to introduce the new mode with targeted tests.

## Detailed findings

### 1) Current `lang=english` behavior is translate-and-run

- Parser allows `lang=kql|kusto|english` and normalizes `kusto` to `kql`.
  - Reference: `src/features/cribl-search/criblSearchMagic.ts:12-14`
  - Reference: `src/features/cribl-search/criblSearchMagic.ts:121-131`
- Executor branch for `lang === 'english'` translates query to KQL (when Cribl API base exists), emits `Generated KQL:` to stdout, then continues into `runCriblSearchJob`.
  - Reference: `src/features/notebook/executor/criblSearchExecutor.ts:135-163`
  - Reference: `src/features/notebook/executor/criblSearchExecutor.ts:166-181`
- In local dev mode (no API base), executor explicitly skips translation and uses query as-is.
  - Reference: `src/features/notebook/executor/criblSearchExecutor.ts:136-147`

### 2) Parsing/editor support already exists and likely only needs semantic doc updates

- Parser type currently models only `'kql' | 'english'` (no separate translate-only enum/value).
  - Reference: `src/features/cribl-search/criblSearchMagic.ts:47-52`
- Parser tests already validate `lang=english` acceptance and invalid-lang messaging.
  - Reference: `src/features/cribl-search/criblSearchMagic.test.ts:53-58`
  - Reference: `src/features/cribl-search/criblSearchMagic.test.ts:142-146`
- Editor autocomplete includes `lang=` as a magic-header suggestion.
  - Reference: `src/features/cribl-search/editor/criblSearchEditor.ts:410-424`
  - Reference: `src/features/cribl-search/editor/criblSearchEditor.test.ts:35-47`

### 3) Existing examples that rely on current english execution behavior

- `Cribl_Search_Examples.ipynb` has multiple `lang=english` cells that currently expect dataframe materialization.
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:25`
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:39`
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:72`
- Additional bundled notebooks also use `lang=english` for direct dataframe flows:
  - `00_Getting_Started_Tour.ipynb`: `public/Examples/00_Getting_Started_Tour.ipynb:39`
  - `AI_Magic.ipynb`: `public/Examples/AI_Magic.ipynb:32`
  - `Incident_Triage_Playbook.ipynb`: `public/Examples/Incident_Triage_Playbook.ipynb:32`
- These notebooks include downstream cells that assume those dataframes exist.
  - Reference: `public/Examples/00_Getting_Started_Tour.ipynb` (post-search `tour_df` usage)
  - Reference: `public/Examples/AI_Magic.ipynb` (post-search `df` usage)
  - Reference: `public/Examples/Incident_Triage_Playbook.ipynb` (post-search `incident_df` usage)

### 4) User-facing docs currently describe english as pre-search translation

- Release notes explicitly state English queries are translated before search execution.
  - Reference: `src/features/welcome/releaseNotes.ts:271-274`
- This text becomes inaccurate if `lang=english` becomes translate-only.

### 5) Test coverage gaps relevant to behavior switch

- Executor tests currently cover Jinja behavior, network failure display, and JSON response rendering, but not a dedicated `lang=english` behavior contract.
  - Reference: `src/features/notebook/executor/criblSearchExecutor.test.ts:50-135`
- This enables adding explicit tests for:
  - translation-only path (no search job call)
  - emitted generated KQL payload/output contract
  - downstream KQL execution pattern via updated notebook examples (manual/integration validation)
