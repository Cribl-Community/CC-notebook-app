# Example Notebooks Awesomeness Research

## High-level summary

Bundled examples are discovered automatically from `public/Examples/*.ipynb`, rendered in a simple picker on the Welcome tab, and opened as editable copies in new notebook tabs. The current examples already cover key capabilities (`%%cribl_search`, `%%cribl_api`, AI prompt templates, visualization libraries, and the Python SDK), but the set is mostly feature-by-feature and less of a guided "wow" journey for new users. Example discovery is filename-driven today (no categories, level, runtime hints, or narrative metadata), and titles shown to users are derived from file names. All bundled notebooks ship with empty outputs, which keeps files clean but increases first-run friction because users must execute every setup/install cell themselves. There is also stale tooling/history around examples generation that no longer matches the current bundled notebook names.

## Detailed findings

### 1) How examples are loaded and shown

- Vite writes `public/Examples/manifest.json` by scanning `public/Examples`, keeping only `.ipynb`, and sorting alphabetically.
  - Reference: `vite.examplesManifestPlugin.ts:7-24`
  - Reference: `vite.examplesManifestPlugin.ts:33-45`
- The examples hook fetches only that manifest and keeps a minimal state machine: `loading`, `error`, `ready` with selected filename.
  - Reference: `src/features/examples/useExamples.ts:10-14`
  - Reference: `src/features/examples/useExamples.ts:42-50`
- Welcome UI presents a plain list/select control and "Open example" action; no per-example description, tags, or difficulty/time metadata is rendered.
  - Reference: `src/features/welcome/WelcomePage.tsx:77-113`
- Display names are inferred from filenames by stripping `.ipynb` and replacing underscores.
  - Reference: `src/features/examples/examplesManifest.ts:16-18`

### 2) What happens when opening an example

- Opening an example creates a new notebook tab, fetches the `.ipynb`, parses it, sets title from filename display label, and restarts that tab's kernel.
  - Reference: `src/features/notebook/hooks/useNotebookLibraryActions.ts:272-292`
- Parsed notebook titles prefer metadata when non-generic, but example-open path currently overrides title from filename.
  - Reference: `src/features/notebook/codec/ipynb.ts:168-176`
  - Reference: `src/features/notebook/hooks/useNotebookLibraryActions.ts:282-283`

### 3) Current example coverage and content patterns

- Bundled set contains five notebooks:
  - `public/Examples/AI_Magic.ipynb`
  - `public/Examples/Cribl_API_Examples.ipynb`
  - `public/Examples/Cribl_Python_SDK.ipynb`
  - `public/Examples/Cribl_Search_Examples.ipynb`
  - `public/Examples/Visualisations.ipynb`
- `AI_Magic.ipynb` already demonstrates AI-button prompt blocks (`### Prompt:`), Jinja `| describe`, and intentional error cells.
  - Reference: `public/Examples/AI_Magic.ipynb:74-99`
  - Reference: `public/Examples/AI_Magic.ipynb:109-126`
- `Cribl_API_Examples.ipynb` documents `%%cribl_api` options, includes search-job GET/POST flows, and Jinja templating in YAML.
  - Reference: `public/Examples/Cribl_API_Examples.ipynb:8-28`
  - Reference: `public/Examples/Cribl_API_Examples.ipynb:64-170`
- `Cribl_Search_Examples.ipynb` covers KQL, English mode, templating modes, and `externaldata`.
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:7-33`
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:156-225`
- `Visualisations.ipynb` demonstrates Matplotlib, Plotly, and Vega-Lite/Altair, but is standalone and not tied to Cribl data flows.
  - Reference: `public/Examples/Visualisations.ipynb:8-140`
- `Cribl_Python_SDK.ipynb` demonstrates `cribl-control-plane`, summarizes inventory, and includes AI prompt templates for generated visualization code.
  - Reference: `public/Examples/Cribl_Python_SDK.ipynb:7-16`
  - Reference: `public/Examples/Cribl_Python_SDK.ipynb:85-155`

### 4) Quality and onboarding gaps visible in current bundle

- Every notebook's code cells are shipped with empty outputs, so users must execute everything themselves (including installs) before seeing results.
  - Reference: `public/Examples/Visualisations.ipynb` (`"outputs": []` count = 6)
  - Reference: `public/Examples/AI_Magic.ipynb` (`"outputs": []` count = 7)
  - Reference: `public/Examples/Cribl_API_Examples.ipynb` (`"outputs": []` count = 6)
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb` (`"outputs": []` count = 9)
  - Reference: `public/Examples/Cribl_Python_SDK.ipynb` (`"outputs": []` count = 6)
- Setup friction appears in multiple notebooks via `micropip.install(...)` pre-steps (`plotly`, `cribl-control-plane`, `seaborn`), which can be slow or proxy-dependent.
  - Reference: `public/Examples/AI_Magic.ipynb:21-23`
  - Reference: `public/Examples/Visualisations.ipynb:88-91`
  - Reference: `public/Examples/Cribl_Python_SDK.ipynb:16`
  - Reference: `public/Examples/Cribl_Search_Examples.ipynb:61`
- The current set is capability-rich but mostly "module demos"; there is no explicit newcomer-first "start here" notebook that connects search → API → visualization → AI in one guided story.
  - Reference: `src/features/welcome/WelcomePage.tsx:61-113`
  - Reference: `src/features/welcome/releaseNotes.ts:289-291`

### 5) Test/tooling baseline and constraints

- Tests validate manifest parsing and hook loading behavior, but do not validate notebook content quality or tutorial structure.
  - Reference: `src/features/examples/examplesManifest.test.ts:4-20`
  - Reference: `src/features/examples/useExamples.test.tsx:13-55`
- App smoke test only stubs `Examples/manifest.json`; example file content is not tested there.
  - Reference: `src/testing/appSmoke.test.tsx:32-38`
- Legacy examples generation script still writes old notebook names (`Cribl_Search_Example.ipynb`, `Matplotlib_Examples.ipynb`) and is not wired into `package.json` scripts.
  - Reference: `scripts/write-examples-ipynb.mjs:223-224`
  - Reference: `package.json:6-15`
