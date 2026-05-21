#!/usr/bin/env node
/**
 * One-shot rewrite helper for the feature-sliced refactor.
 *
 * Given the set of `git mv`s in the refactor, the old module specifiers used
 * in `import ... from '...'` statements no longer resolve. This walks the
 * `src/` tree and rewrites every old specifier to its new alias-based path.
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(process.cwd(), 'src')

/** Specifier tail → new alias path. Specificity matters: more specific first. */
const MAP = {
  // platform/pyodide
  'pyodide/types': '@platform/pyodide/types',
  'pyodide/PyodideKernel': '@platform/pyodide/PyodideKernel',
  'pyodide/packageFetchCache': '@platform/pyodide/packageFetchCache',
  'pyodide/pyodideVersion': '@platform/pyodide/pyodideVersion',
  // platform/cribl
  'cribl/kvstore': '@platform/cribl/kvstore',
  'cribl/searchJobs': '@platform/cribl/searchJobs',
  'cribl/searchQuery': '@platform/cribl/searchQuery',
  'cribl/searchResultModel': '@platform/cribl/searchResultModel',
  'cribl/searchStub': '@platform/cribl/searchStub',
  'cribl/aiTranslate': '@platform/cribl/aiTranslate',
  // moved to ai-riptide feature
  'cribl/riptideCode': '@features/ai-riptide/riptideService',
  // notebook model / reducer / codec
  'notebook/types': '@features/notebook/model/types',
  'notebook/notebookReducer': '@features/notebook/reducer/notebookReducer',
  'notebook/outputArea': '@/domain/iopubOutputArea',
  'notebook/notebookOutputAreaSideState': '@features/notebook/reducer/notebookOutputAreaSideState',
  'notebook/ipynb': '@features/notebook/codec/ipynb',
  'notebook/tabWorkspace': '@features/notebook/reducer/tabWorkspace',
  // notebook executor
  'notebook/runNotebookCell': '@features/notebook/executor/runNotebookCell',
  'notebook/runQueueAbort': '@features/notebook/executor/runQueueAbort',
  // notebook hooks
  'notebook/useTabNotebookRuntime': '@features/notebook/hooks/useTabNotebookRuntime',
  // notebook ui
  'notebook/NotebookPage': '@features/notebook/ui/NotebookPage',
  'notebook/CellList': '@features/notebook/ui/CellList',
  'notebook/CodeCell': '@features/notebook/ui/CodeCell',
  'notebook/MarkdownCell': '@features/notebook/ui/MarkdownCell',
  'notebook/CellOutput': '@features/notebook/ui/CellOutput',
  'notebook/Toolbar': '@features/notebook/ui/Toolbar',
  'notebook/NotebookTabs': '@features/notebook/ui/NotebookTabs',
  'notebook/NotebookDialog': '@features/notebook/ui/NotebookDialog',
  'notebook/MimeBundleView': '@features/notebook/ui/MimeBundleView',
  'notebook/PlotlyMimeView': '@features/notebook/ui/PlotlyMimeView',
  'notebook/VegaMimeView': '@features/notebook/ui/VegaMimeView',
  'notebook/mimeRegistry': '@features/notebook/ui/mimeRegistry',
  'notebook/ansiUtils': '@features/notebook/ui/ansiUtils',
  // library feature
  'notebook/NotebookSidebar': '@features/library/ui/NotebookSidebar',
  'notebook/notebookLibrary': '@features/library/notebookLibrary',
  'notebook/manifest': '@features/library/manifest',
  // welcome + examples
  'notebook/WelcomePage': '@features/welcome/WelcomePage',
  'notebook/WelcomeProxyCheck': '@features/welcome/WelcomeProxyCheck',
  'notebook/proxySmokeTest': '@features/welcome/proxySmokeTest',
  'notebook/releaseNotes': '@features/welcome/releaseNotes',
  'notebook/examplesManifest': '@features/examples/examplesManifest',
  // cribl-search feature
  'notebook/criblSearchMagic': '@features/cribl-search/criblSearchMagic',
  'notebook/criblSearchCellRunner': '@features/cribl-search/criblSearchCellRunner',
  'notebook/criblSearchStreamFilter': '@features/cribl-search/criblSearchStreamFilter',
  'notebook/criblSearchEditor': '@features/cribl-search/editor/criblSearchEditor',
  'notebook/criblKqlHighlight': '@features/cribl-search/editor/criblKqlHighlight',
  'notebook/CriblSearchOutput': '@features/cribl-search/ui/CriblSearchOutput',
  // shared ui + platform
  'notebook/pythonCodeMirror': '@ui/editor/pythonCodeMirror',
  'notebook/staticAssets': '@platform/staticAssets',
}

const BARE_FILE_MAP = {
  // Short specifiers that appear as `./X` from a same-directory import in the
  // old layout; after the move the file lives elsewhere, so map directly.
  // Keep this list minimal — the relative resolver below handles most cases.
}

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield full
  }
}

/** Resolve a relative specifier against the pre-move path of the importing file. */
function resolveOldSpecifier(filePath, spec) {
  if (!spec.startsWith('.')) return null
  // Reconstruct old location from new location heuristically.
  const rel = path.relative(ROOT, filePath).split(path.sep).join('/')
  // Derive the "subject" directory after the first path segment. Match both
  // moved-from-notebook files and pyodide/cribl folders.
  let oldDir = ''
  if (rel.startsWith('features/notebook/')) oldDir = 'notebook'
  else if (rel.startsWith('features/library/')) oldDir = 'notebook'
  else if (rel.startsWith('features/welcome/')) oldDir = 'notebook'
  else if (rel.startsWith('features/examples/')) oldDir = 'notebook'
  else if (rel.startsWith('features/cribl-search/')) oldDir = 'notebook'
  else if (rel.startsWith('features/ai-riptide/')) oldDir = 'cribl'
  else if (rel.startsWith('platform/cribl/')) oldDir = 'cribl'
  else if (rel.startsWith('platform/pyodide/')) oldDir = 'pyodide'
  else if (rel === 'App.tsx' || rel === 'main.tsx' || rel === 'PyodideSmokeTest.tsx')
    oldDir = ''
  else return null

  // Synthesize the old file path, then resolve the spec relative to it,
  // and match against the MAP by the resulting key.
  const oldFilePath = oldDir ? path.join(ROOT, oldDir, path.basename(filePath)) : filePath
  const absResolved = path.resolve(path.dirname(oldFilePath), spec)
  const relFromSrc = path.relative(ROOT, absResolved).split(path.sep).join('/')
  return MAP[relFromSrc] ?? BARE_FILE_MAP[relFromSrc] ?? null
}

const IMPORT_RE = /((?:from|import)\s*\(?\s*|require\(\s*)(['"])([^'"\n]+)(\2)/g

async function processFile(filePath) {
  const src = await fs.readFile(filePath, 'utf8')
  let changed = false
  const out = src.replace(IMPORT_RE, (whole, prefix, q1, spec, q2) => {
    // First try to resolve relative specifiers against the pre-move layout.
    const resolved = resolveOldSpecifier(filePath, spec)
    if (resolved) {
      changed = true
      return `${prefix}${q1}${resolved}${q2}`
    }
    // Fallback: specifier tail match (covers deeper relatives like ../foo/bar).
    for (const [tail, target] of Object.entries(MAP)) {
      if (spec.endsWith('/' + tail) || spec === './' + tail || spec === '../' + tail) {
        changed = true
        return `${prefix}${q1}${target}${q2}`
      }
    }
    return whole
  })
  if (changed) {
    await fs.writeFile(filePath, out)
    return true
  }
  return false
}

async function main() {
  let count = 0
  for await (const f of walk(ROOT)) {
    if (await processFile(f)) count++
  }
  console.log(`rewrote imports in ${count} files`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
