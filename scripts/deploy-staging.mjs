/**
 * Upload the packaged app (.tgz) to a Cribl deployment via HTTPS.
 *
 * Tokens and tenant-specific URLs MUST come from the environment or CI secrets —
 * never commit them.
 *
 * Required:
 *   CRIBL_DEPLOY_URL — Full URL for the upload request (from OpenAPI / platform docs).
 *   CRIBL_API_TOKEN — Bearer token sent as Authorization (store in vault / GitHub Secrets).
 *
 * Optional:
 *   PACKAGE_TGZ — Path to the archive (default: newest `notebook-app-*.tgz` under build/).
 *   CRIBL_DEPLOY_FORM_FIELD — Multipart field name for the file (default: `package`).
 *   CRIBL_DEPLOY_METHOD — `POST` (default) or `PUT`.
 *   CRIBL_DEPLOY_DRY_RUN — Set to `1` to resolve PACKAGE_TGZ and exit without calling the network.
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = join(__dirname, '..')

async function resolvePackagePath() {
  const envPath = process.env.PACKAGE_TGZ?.trim()
  if (envPath) return envPath

  const buildDir = join(rootDir, 'build')
  let names
  try {
    names = await readdir(buildDir)
  } catch {
    throw new Error(`No PACKAGE_TGZ set and cannot read build/: run npm run package first`)
  }
  const tgz = names.filter((n) => n.endsWith('.tgz')).sort()
  if (!tgz.length) {
    throw new Error(`No .tgz in build/: run npm run package first`)
  }
  const picked = tgz[tgz.length - 1]
  return join(buildDir, picked)
}

async function main() {
  const url = process.env.CRIBL_DEPLOY_URL?.trim()
  const token = process.env.CRIBL_API_TOKEN?.trim()
  const dry = process.env.CRIBL_DEPLOY_DRY_RUN === '1'

  const packagePath = await resolvePackagePath()
  const st = await stat(packagePath)
  if (!st.isFile()) throw new Error(`Not a file: ${packagePath}`)

  console.log(`Package: ${packagePath} (${(st.size / (1024 * 1024)).toFixed(2)} MiB)`)

  if (!url || !token) {
    console.error(
      '\nMissing CRIBL_DEPLOY_URL or CRIBL_API_TOKEN.\n' +
        'Set both in your shell or CI secrets. Do not commit credentials.\n',
    )
    process.exitCode = 1
    return
  }

  if (dry) {
    console.log('CRIBL_DEPLOY_DRY_RUN=1 — skipping HTTP upload.')
    return
  }

  const field = process.env.CRIBL_DEPLOY_FORM_FIELD?.trim() || 'package'
  const method = (process.env.CRIBL_DEPLOY_METHOD?.trim() || 'POST').toUpperCase()

  const bytes = await readFile(packagePath)
  const body = new FormData()
  body.append(field, new Blob([bytes]), basename(packagePath))

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body,
  })

  const text = await res.text()
  if (!res.ok) {
    console.error(`Upload failed: HTTP ${res.status}`)
    console.error(text.slice(0, 2000))
    process.exitCode = 1
    return
  }

  console.log(`Upload succeeded: HTTP ${res.status}`)
  if (text.length && text.length < 500) console.log(text)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
