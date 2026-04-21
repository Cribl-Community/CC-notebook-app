import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

const MANIFEST_FILENAME = 'manifest.json'

async function writeExamplesManifest(root: string): Promise<void> {
  const dir = join(root, 'public', 'Examples')
  let notebooks: string[] = []
  try {
    const entries = await readdir(dir)
    notebooks = entries
      .filter((f) => f.endsWith('.ipynb') && f !== MANIFEST_FILENAME)
      .sort((a, b) => a.localeCompare(b))
  } catch {
    /* directory may not exist yet */
  }
  await mkdir(dir, { recursive: true })
  await writeFile(
    join(dir, MANIFEST_FILENAME),
    `${JSON.stringify({ version: 1 as const, notebooks })}\n`,
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
