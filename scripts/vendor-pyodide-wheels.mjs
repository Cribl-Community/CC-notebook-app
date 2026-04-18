/**
 * Downloads the pandas + matplotlib wheel closure from the official Pyodide CDN
 * into public/pyodide/full/ so loadPyodide({ packageBaseUrl }) can use same-origin
 * URLs (workaround when pack proxy + jsDelivr are unavailable).
 *
 * Remove this script and stop calling it once proxying works; use CDN packageBaseUrl again.
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

const ROOT_PACKAGES = ['pandas', 'matplotlib']

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

async function main() {
  const [lockRaw, pyodidePkgRaw] = await Promise.all([readFile(lockPath, 'utf8'), readFile(pyodidePkgPath, 'utf8')])
  const lock = JSON.parse(lockRaw)
  const pyodideVersion = JSON.parse(pyodidePkgRaw).version
  if (!pyodideVersion) {
    throw new Error('Missing pyodide version in node_modules/pyodide/package.json')
  }

  const queue = [...ROOT_PACKAGES]
  const seen = new Set()
  while (queue.length) {
    const name = queue.pop()
    if (seen.has(name)) continue
    seen.add(name)
    const pkg = lock.packages?.[name]
    if (!pkg) {
      throw new Error(`Package "${name}" not found in pyodide-lock.json`)
    }
    for (const d of pkg.depends ?? []) {
      queue.push(d)
    }
  }

  const base = `https://cdn.jsdelivr.net/pyodide/v${pyodideVersion}/full/`
  await mkdir(outDir, { recursive: true })

  for (const name of seen) {
    const pkg = lock.packages[name]
    const fileName = pkg.file_name
    const expected = pkg.sha256
    if (!fileName || !expected) {
      throw new Error(`Missing file_name/sha256 for package "${name}"`)
    }
    const dest = join(outDir, fileName)
    if (await fileExists(dest)) {
      const buf = await readFile(dest)
      const got = sha256Hex(buf)
      if (got === expected) {
        console.log(`ok (cached) ${fileName}`)
        continue
      }
      console.warn(`hash mismatch for ${fileName}, re-downloading`)
    }
    const url = base + fileName
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    const got = sha256Hex(buf)
    if (got !== expected) {
      throw new Error(`SHA-256 mismatch for ${fileName}: expected ${expected}, got ${got}`)
    }
    await writeFile(dest, buf)
    console.log(`ok ${fileName}`)
  }

  console.log(`Vendored ${seen.size} Pyodide packages into ${outDir}`)
}

await main()
