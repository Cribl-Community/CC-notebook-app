/**
 * Downloads the wheel closure of a curated set of Python packages into
 * public/pyodide/full/ so loadPyodide({ packageBaseUrl }) can use same-origin
 * URLs (workaround when pack proxy + jsDelivr are unavailable).
 *
 * Packages are walked transitively from pyodide-lock.json (cdn.jsdelivr.net):
 * pandas, matplotlib, ipython, micropip, jedi and their deps. URL + sha256
 * come from the lock file.
 *
 * Remove this script and stop calling it once proxying works; use CDN
 * packageBaseUrl again.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')
const lockPath = join(rootDir, 'node_modules', 'pyodide', 'pyodide-lock.json')
const pyodidePkgPath = join(rootDir, 'node_modules', 'pyodide', 'package.json')
const outDir = join(rootDir, 'public', 'pyodide', 'full')

/** Walked transitively against pyodide-lock.json. */
const LOCK_ROOT_PACKAGES = ['pandas', 'matplotlib', 'ipython', 'micropip', 'jedi']

function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}

async function fileExists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function ensureFile({ name, fileName, url, sha256 }) {
  const dest = join(outDir, fileName)
  if (await fileExists(dest)) {
    const buf = await readFile(dest)
    const got = sha256Hex(buf)
    if (got === sha256) {
      console.log(`ok (cached) ${fileName}`)
      return
    }
    console.warn(`hash mismatch for ${fileName} — re-downloading`)
  }
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} (package ${name})`)
  }
  const buf = Buffer.from(await res.arrayBuffer())
  const got = sha256Hex(buf)
  if (got !== sha256) {
    throw new Error(`SHA-256 mismatch for ${fileName}: expected ${sha256}, got ${got}`)
  }
  await writeFile(dest, buf)
  console.log(`ok ${fileName}`)
}

async function main() {
  const [lockRaw, pyodidePkgRaw] = await Promise.all([
    readFile(lockPath, 'utf8'),
    readFile(pyodidePkgPath, 'utf8'),
  ])
  const lock = JSON.parse(lockRaw)
  const pyodideVersion = JSON.parse(pyodidePkgRaw).version
  if (!pyodideVersion) {
    throw new Error('Missing pyodide version in node_modules/pyodide/package.json')
  }

  // Walk transitive closure for the lock-based roots. Normalize names —
  // pyodide-lock uses dashes for package keys but lists deps with underscores.
  const lockKey = (name) => {
    if (lock.packages?.[name]) return name
    const dashed = name.replace(/_/g, '-')
    if (lock.packages?.[dashed]) return dashed
    const underscored = name.replace(/-/g, '_')
    if (lock.packages?.[underscored]) return underscored
    throw new Error(`Package "${name}" not found in pyodide-lock.json`)
  }

  const queue = LOCK_ROOT_PACKAGES.map(lockKey)
  const seen = new Set()
  while (queue.length) {
    const name = queue.pop()
    if (seen.has(name)) continue
    seen.add(name)
    const pkg = lock.packages[name]
    for (const d of pkg.depends ?? []) {
      queue.push(lockKey(d))
    }
  }

  const cdnBase = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`
  await mkdir(outDir, { recursive: true })

  for (const name of seen) {
    const pkg = lock.packages[name]
    if (!pkg.file_name || !pkg.sha256) {
      throw new Error(`Missing file_name/sha256 for package "${name}"`)
    }
    await ensureFile({
      name,
      fileName: pkg.file_name,
      sha256: pkg.sha256,
      url: cdnBase + pkg.file_name,
    })
  }

  console.log(`Vendored ${seen.size} Pyodide packages into ${outDir}`)
}

await main()
