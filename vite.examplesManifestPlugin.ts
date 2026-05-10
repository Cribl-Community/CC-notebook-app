import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const MANIFEST_FILENAME = 'manifest.json'
type ExampleLevel = 'beginner' | 'intermediate' | 'advanced'

type GeneratedExample = {
  filename: string
  title: string
  summary: string
  tags: string[]
  level: ExampleLevel
  estimatedRuntime: string
  recommendedOrder: number
}

const EXAMPLE_METADATA: Record<string, Omit<GeneratedExample, 'filename' | 'title'>> = {
  '00_Getting_Started_Tour.ipynb': {
    summary: 'Start here: run your first cells and open curated follow-ups.',
    tags: ['onboarding', 'starter'],
    level: 'beginner',
    estimatedRuntime: '5 min',
    recommendedOrder: 1,
  },
  'Incident_Triage_Playbook.ipynb': {
    summary: 'End-to-end triage flow with search, API checks, charts, and AI prompts.',
    tags: ['workflow', 'search', 'api', 'ai'],
    level: 'intermediate',
    estimatedRuntime: '15 min',
    recommendedOrder: 2,
  },
  'Cribl_Search_Examples.ipynb': {
    summary: 'KQL and English search patterns with templating and follow-up analysis.',
    tags: ['search', 'kql'],
    level: 'beginner',
    estimatedRuntime: '12 min',
    recommendedOrder: 3,
  },
  'Cribl_API_Examples.ipynb': {
    summary: 'Use %%cribl_api for GET/POST requests and templated YAML payloads.',
    tags: ['api', 'magic-cells'],
    level: 'intermediate',
    estimatedRuntime: '12 min',
    recommendedOrder: 4,
  },
  'Cribl_Python_SDK.ipynb': {
    summary: 'SDK walkthrough for inventory insights and plotting with AI prompt helpers.',
    tags: ['sdk', 'python'],
    level: 'advanced',
    estimatedRuntime: '15 min',
    recommendedOrder: 5,
  },
  'AI_Magic.ipynb': {
    summary: 'Prompt patterns for generate-and-iterate visualizations and debugging.',
    tags: ['ai', 'prompting'],
    level: 'intermediate',
    estimatedRuntime: '10 min',
    recommendedOrder: 6,
  },
  'Anomaly_Detection_PyOD.ipynb': {
    summary:
      'Time-series windows: PyOD where WASM allows, otherwise sklearn-labeled substitutes (Numba/torch slots); temperatures via %%cribl_search externaldata; interactive Plotly per model with anomaly markers (after JaminJeong/AnomalyDetectionUsingPyOD).',
    tags: ['python', 'ml', 'pyod', 'visualization', 'plotly'],
    level: 'advanced',
    estimatedRuntime: '25–40 min first run',
    recommendedOrder: 8,
  },
  'Visualisations.ipynb': {
    summary: 'Rendering recipes with Matplotlib, Plotly, and Vega-Lite.',
    tags: ['visualization', 'plotly', 'altair'],
    level: 'beginner',
    estimatedRuntime: '10 min',
    recommendedOrder: 7,
  },
}

function displayTitle(filename: string): string {
  return filename.replace(/\.ipynb$/i, '').replace(/_/g, ' ')
}

function toGeneratedExample(filename: string, idx: number): GeneratedExample {
  const metadata = EXAMPLE_METADATA[filename]
  return {
    filename,
    title: displayTitle(filename),
    summary: metadata?.summary ?? 'Bundled example notebook.',
    tags: metadata?.tags ?? [],
    level: metadata?.level ?? 'beginner',
    estimatedRuntime: metadata?.estimatedRuntime ?? '5-10 min',
    recommendedOrder: metadata?.recommendedOrder ?? idx + 1,
  }
}

async function writeExamplesManifest(root: string): Promise<void> {
  const dir = join(root, 'public', 'Examples')
  let notebookFiles: string[] = []
  try {
    const entries = await readdir(dir)
    notebookFiles = entries
      .filter((f) => f.endsWith('.ipynb') && f !== MANIFEST_FILENAME)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    /* directory may not exist yet */
  }
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, MANIFEST_FILENAME),
    `${JSON.stringify(
      {
        version: 2 as const,
        notebooks: notebookFiles.map((filename, idx) => toGeneratedExample(filename, idx)),
      },
      null,
      2,
    )}\n`,
    'utf-8',
  )
}

export function examplesManifestPlugin(): Plugin {
  let root: string
  return {
    name: 'examples-manifest',
    configResolved(config: ResolvedConfig) {
      root = config.root
    },
    async buildStart() {
      await writeExamplesManifest(root)
    },
    configureServer(server) {
      const examplesDir = join(server.config.root, 'public', 'Examples')
      void writeExamplesManifest(server.config.root)
      server.watcher.add(examplesDir)
      server.watcher.on('all', (_event, path) => {
        if (!path.startsWith(examplesDir)) return
        if (basename(path) === MANIFEST_FILENAME) return
        void writeExamplesManifest(server.config.root).then(() => {
          server.ws.send({ type: 'full-reload' })
        })
      })
    },
  }
}
