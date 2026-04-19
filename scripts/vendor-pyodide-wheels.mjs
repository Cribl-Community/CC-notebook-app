/**
 * Downloads the wheel closure of a curated set of Python packages into
 * public/pyodide/full/ so loadPyodide({ packageBaseUrl }) can use same-origin
 * URLs (workaround when pack proxy + jsDelivr are unavailable).
 *
 * Two sources are used:
 *  - Packages in pyodide-lock.json (cdn.jsdelivr.net): pandas, matplotlib,
 *    ipython and their transitive deps. URL + sha256 come from the lock file.
 *  - PyPI-only packages (pypi.org / files.pythonhosted.org): ipywidgets,
 *    itables and the widget runtime. These are pinned by exact version + sha
 *    in EXTRA_PYPI_WHEELS below so builds remain reproducible.
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

/**
 * PyPI-only wheels (not in pyodide-lock.json). Pinned to exact versions and
 * sha256s for reproducibility. Resolved at runtime by `micropip.install` once
 * Pyodide is loaded; we cache them here so the pack proxy never has to fetch
 * from PyPI.
 */
const EXTRA_PYPI_WHEELS = [
  {
    name: 'ipywidgets',
    version: '8.1.8',
    fileName: 'ipywidgets-8.1.8-py3-none-any.whl',
    sha256: 'ecaca67aed704a338f88f67b1181b58f821ab5dc89c1f0f5ef99db43c1c2921e',
    url:
      'https://files.pythonhosted.org/packages/py3/i/ipywidgets/ipywidgets-8.1.8-py3-none-any.whl',
  },
  {
    name: 'jupyterlab_widgets',
    version: '3.0.16',
    fileName: 'jupyterlab_widgets-3.0.16-py3-none-any.whl',
    sha256: '45fa36d9c6422cf2559198e4db481aa243c7a32d9926b500781c830c80f7ecf8',
    url:
      'https://files.pythonhosted.org/packages/py3/j/jupyterlab_widgets/jupyterlab_widgets-3.0.16-py3-none-any.whl',
  },
  {
    name: 'widgetsnbextension',
    version: '4.0.15',
    fileName: 'widgetsnbextension-4.0.15-py3-none-any.whl',
    sha256: '8156704e4346a571d9ce73b84bee86a29906c9abfd7223b7228a28899ccf3366',
    url:
      'https://files.pythonhosted.org/packages/py3/w/widgetsnbextension/widgetsnbextension-4.0.15-py3-none-any.whl',
  },
  {
    name: 'comm',
    version: '0.2.3',
    fileName: 'comm-0.2.3-py3-none-any.whl',
    sha256: 'c615d91d75f7f04f095b30d1c1711babd43bdc6419c1be9886a85f2f4e489417',
    url: 'https://files.pythonhosted.org/packages/py3/c/comm/comm-0.2.3-py3-none-any.whl',
  },
  {
    name: 'itables',
    version: '2.7.3',
    fileName: 'itables-2.7.3-py3-none-any.whl',
    sha256: 'b24ebd6a4ab3edab200f41c56e20a12b12b95ec15d3697aeb9bee71d92c008a9',
    url: 'https://files.pythonhosted.org/packages/py3/i/itables/itables-2.7.3-py3-none-any.whl',
  },
]

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

  // 1. Walk transitive closure for the lock-based roots. Normalize names —
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

  // 2. Extra PyPI-only wheels (ipywidgets, itables, …).
  for (const extra of EXTRA_PYPI_WHEELS) {
    await ensureFile(extra)
  }

  console.log(
    `Vendored ${seen.size + EXTRA_PYPI_WHEELS.length} Pyodide packages into ${outDir}`,
  )
}

await main()
