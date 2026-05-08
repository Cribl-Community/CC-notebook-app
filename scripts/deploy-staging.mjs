/**
 * Deploy the packaged `.tgz` to a Cribl workspace leader using the same API flow as the Apps UI:
 *   1. PUT /api/v1/apps?filename=<basename>   (body = raw archive, Content-Type: application/gzip)
 *   2. POST /api/v1/apps/preinstall-check      ({ source: staged name from step 1 })
 *   3. POST /api/v1/apps                       ({ source, id: pack id })
 *
 * Tokens MUST come from the environment or CI secrets — never commit them.
 * Env load order: `e2e/.auth/captured-credentials.env` (from `npm run e2e:auth`), then
 * `e2e/.env`; existing shell/CI variables always win over both.
 *
 * Required:
 *   CRIBL_API_TOKEN — Bearer token accepted by the leader API (PAT / automation token).
 *
 * Leader host (one of):
 *   CRIBL_DEPLOY_BASE_URL — Workspace leader origin, no path, e.g. https://appplat-….cribl-staging.cloud
 *   CRIBL_E2E_BASE_URL — Same value works if you already set it for Playwright.
 *   CRIBL_DEPLOY_URL — Optional legacy: any HTTPS URL on that host; only its origin is used.
 *
 * Optional:
 *   PACKAGE_TGZ — Archive path (default: newest `*.tgz` under build/).
 *   CRIBL_DEPLOY_PACK_ID — Override computed pack id (default: {name}-{version dots→dashes}-tgz from package.json).
 *   CRIBL_DEPLOY_DRY_RUN — Set to `1` to resolve paths and exit without HTTP calls.
 *   CRIBL_DEPLOY_VERIFY_URL — After install, GET this URL until JSON status is ready (optional).
 *   CRIBL_DEPLOY_SKIP_VERIFY — Set to `1` to skip CRIBL_DEPLOY_VERIFY_URL polling only.
 *   CRIBL_DEPLOY_POLL_MAX_MS / CRIBL_DEPLOY_POLL_INTERVAL_MS — Verify polling tuning.
 *   CRIBL_DEPLOY_READY_STATUSES / CRIBL_DEPLOY_FAILED_STATUSES — Verify polling (comma-separated).
 *
 * If POST /api/v1/apps reports a conflict (e.g. pack id already installed), the script
 * DELETEs `/api/v1/apps/{packId}` and retries registration once.
 *   CRIBL_DEPLOY_NO_CONFLICT_RETRY — Set to `1` to disable delete+retry (fail on conflict).
 */
import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const rootDir = join(__dirname, '..')

/** Captured during `npm run e2e:auth` (gitignored). Loaded before `e2e/.env` so manual vars override. */
const capturedEnvPath = join(rootDir, 'e2e', '.auth', 'captured-credentials.env')
if (existsSync(capturedEnvPath)) {
  dotenv.config({ path: capturedEnvPath })
}

const e2eEnvPath = join(rootDir, 'e2e', '.env')
if (existsSync(e2eEnvPath)) {
  dotenv.config({ path: e2eEnvPath })
}

const DEPLOY_AGENT = 'notebook-app-deploy-script'

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function tryParseJson(text) {
  const t = text?.trim()
  if (!t || (t[0] !== '{' && t[0] !== '[')) return null
  try {
    return JSON.parse(t)
  } catch {
    return null
  }
}

function looksLikeHtmlResponse(bodyText, contentTypeHeader) {
  const ct = contentTypeHeader?.toLowerCase() ?? ''
  if (ct.includes('text/html')) return true
  const s = bodyText?.trimStart().toLowerCase() ?? ''
  return s.startsWith('<!doctype html') || s.startsWith('<html')
}

function explainWrongLeaderBase() {
  return (
    '\nThe leader API returned HTML (SPA) instead of JSON. Use the workspace **leader origin**\n' +
      '(the same host as `/apps`, e.g. https://appplat-….cribl-staging.cloud), not `/apps` paths.\n'
  )
}

function splitCsvEnv(value, fallback) {
  const raw = value?.trim()
  const parts = raw
    ? raw
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : fallback
  return new Set(parts)
}

function pickStatus(json) {
  if (!json || typeof json !== 'object') return ''
  const s =
    json.status ??
    json.state ??
    json.phase ??
    json.data?.status ??
    json.job?.status ??
    json.pack?.status ??
    ''
  return String(s).toLowerCase()
}

async function pollUntilPackReady(pollUrl, token) {
  const maxMs = Number(process.env.CRIBL_DEPLOY_POLL_MAX_MS ?? '180000')
  const intervalMs = Number(process.env.CRIBL_DEPLOY_POLL_INTERVAL_MS ?? '2500')
  const ready = splitCsvEnv(process.env.CRIBL_DEPLOY_READY_STATUSES, [
    'complete',
    'completed',
    'success',
    'succeeded',
    'ready',
    'installed',
    'active',
    'done',
    'available',
  ])
  const failed = splitCsvEnv(process.env.CRIBL_DEPLOY_FAILED_STATUSES, [
    'failed',
    'error',
    'cancelled',
    'canceled',
    'rejected',
  ])

  const deadline = Date.now() + maxMs
  let attempt = 0

  while (Date.now() < deadline) {
    attempt += 1
    const r = await fetch(pollUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const text = await r.text()
    const j = tryParseJson(text)
    const st = pickStatus(j)

    if (!r.ok && r.status >= 400) {
      console.error(`Verify GET failed: HTTP ${r.status} (attempt ${attempt})`)
      console.error(text.slice(0, 2000))
      process.exitCode = 1
      return
    }

    if (st && failed.has(st)) {
      console.error(`Pack install reported failure status: ${st}`)
      console.error(text.slice(0, 2000))
      process.exitCode = 1
      return
    }

    if (st && ready.has(st)) {
      console.log(`Pack ready (status=${st}) after ${attempt} poll(s).`)
      if (text.length && text.length < 1200) console.log(text)
      return
    }

    if (looksLikeHtmlResponse(text, r.headers.get('content-type'))) {
      console.error(
        '\nVerify URL returned HTML (browser UI). Point CRIBL_DEPLOY_VERIFY_URL at a JSON API route.\n',
      )
      console.error(text.slice(0, 800))
      process.exitCode = 1
      return
    }

    if (r.ok && !text.trim()) {
      console.log('Verify GET succeeded with an empty body; treating pack check as complete.')
      return
    }

    if (st) {
      console.log(`Waiting for pack… status=${st} (${attempt})`)
    } else if (r.ok) {
      console.log(`Waiting for pack… (attempt ${attempt}, no status field yet)`)
    }

    await sleep(intervalMs)
  }

  console.error(`Timed out after ${maxMs}ms waiting for pack readiness at:\n  ${pollUrl}`)
  process.exitCode = 1
}

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

function resolveDeployBaseUrl() {
  const strip = (/** @type {string} */ u) => u.replace(/\/$/, '')
  const a = process.env.CRIBL_DEPLOY_BASE_URL?.trim()
  if (a) return strip(a)
  const b = process.env.CRIBL_E2E_BASE_URL?.trim()
  if (b) return strip(b)
  const legacy = process.env.CRIBL_DEPLOY_URL?.trim()
  if (legacy) {
    try {
      return strip(new URL(legacy).origin)
    } catch {
      /* ignore */
    }
  }
  return ''
}

async function readPackageMeta() {
  const raw = await readFile(join(rootDir, 'package.json'), 'utf8')
  const j = JSON.parse(raw)
  const name = typeof j.name === 'string' ? j.name.trim() : ''
  const version = typeof j.version === 'string' ? j.version.trim() : ''
  if (!name || !version) throw new Error('package.json must contain non-empty name and version')
  return { name, version }
}

function packIdFromMeta(meta) {
  const override = process.env.CRIBL_DEPLOY_PACK_ID?.trim()
  if (override) return override
  return `${meta.name}-${meta.version.replace(/\./g, '-')}-tgz`
}

function extractStagedSource(putJson) {
  if (!putJson || typeof putJson !== 'object') return null
  for (const key of ['source', 'filename', 'path', 'name']) {
    const v = putJson[key]
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  const item0 = putJson.items?.[0]
  if (item0 && typeof item0 === 'object') {
    for (const key of ['source', 'filename', 'path']) {
      const v = item0[key]
      if (typeof v === 'string' && v.trim()) return v.trim()
    }
  }
  return null
}

function collectApiErrorText(json) {
  if (!json || typeof json !== 'object') return ''
  const parts = [
    json.message,
    json.error,
    json.reason,
    json.detail,
    ...(Array.isArray(json.errors) ? json.errors.map(String) : []),
    ...(Array.isArray(json.messages) ? json.messages.map(String) : []),
  ]
  return parts.filter(Boolean).join(' ')
}

function looksLikeInstallConflict(httpStatus, bodyText) {
  if (httpStatus === 409 || httpStatus === 412) return true
  const lower = bodyText.toLowerCase()
  const hint =
    /already exists|duplicate|conflict|already installed|unique constraint|must be unique/i.test(lower)
  if (hint) return true
  const j = tryParseJson(bodyText)
  const blob = `${collectApiErrorText(j)} ${lower}`
  return /already exists|duplicate|conflict|already installed|unique constraint|must be unique/i.test(blob)
}

async function deleteLeaderAppPack(baseUrl, token, packId) {
  const url = `${baseUrl}/api/v1/apps/${encodeURIComponent(packId)}`
  console.log(`DELETE ${url}`)
  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
      'x-cribl-agent': DEPLOY_AGENT,
    },
  })
  const text = await res.text()

  if (res.status === 404) {
    console.log(`No existing pack ${packId} (404).`)
    return true
  }

  if (!res.ok) {
    console.error(`DELETE /api/v1/apps failed: HTTP ${res.status}`)
    console.error(text.slice(0, 2000))
    return false
  }

  console.log(`Removed existing pack ${packId} (HTTP ${res.status}).`)
  return true
}

async function postRegisterPack(baseUrl, token, stagedSource, packId) {
  const installUrl = `${baseUrl}/api/v1/apps`
  const installRes = await fetch(installUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-cribl-agent': DEPLOY_AGENT,
    },
    body: JSON.stringify({ source: stagedSource, id: packId }),
  })
  const installText = await installRes.text()
  return { res: installRes, text: installText }
}

async function criblLeaderDeployAppsPack(baseUrl, token, packagePath, packId) {
  const archiveName = basename(packagePath)
  const bytes = await readFile(packagePath)

  const putUrl = `${baseUrl}/api/v1/apps?filename=${encodeURIComponent(archiveName)}`
  console.log(`PUT ${putUrl}`)

  const putRes = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/gzip',
      'x-cribl-agent': DEPLOY_AGENT,
    },
    body: bytes,
  })
  const putText = await putRes.text()

  if (!putRes.ok) {
    console.error(`PUT /api/v1/apps failed: HTTP ${putRes.status}`)
    console.error(putText.slice(0, 2000))
    process.exitCode = 1
    return false
  }

  if (looksLikeHtmlResponse(putText, putRes.headers.get('content-type'))) {
    console.error(explainWrongLeaderBase())
    console.error(putText.slice(0, 800))
    process.exitCode = 1
    return false
  }

  const putJson = tryParseJson(putText)
  const stagedSource = extractStagedSource(putJson)
  if (!stagedSource) {
    console.error(
      'PUT /api/v1/apps succeeded but the JSON response did not include a staged archive name (`source` / `filename` / similar). Body:',
    )
    console.error(putText.slice(0, 2000))
    process.exitCode = 1
    return false
  }
  console.log(`Staged as: ${stagedSource}`)

  const preUrl = `${baseUrl}/api/v1/apps/preinstall-check`
  console.log(`POST ${preUrl}`)
  const preRes = await fetch(preUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-cribl-agent': DEPLOY_AGENT,
    },
    body: JSON.stringify({ source: stagedSource }),
  })
  const preText = await preRes.text()

  if (!preRes.ok) {
    console.error(`preinstall-check failed: HTTP ${preRes.status}`)
    console.error(preText.slice(0, 2000))
    process.exitCode = 1
    return false
  }

  if (looksLikeHtmlResponse(preText, preRes.headers.get('content-type'))) {
    console.error(explainWrongLeaderBase())
    console.error(preText.slice(0, 800))
    process.exitCode = 1
    return false
  }

  console.log(`preinstall-check OK (${preText.length} bytes)`)

  console.log(`POST ${baseUrl}/api/v1/apps`)
  let { res: installRes, text: installText } = await postRegisterPack(baseUrl, token, stagedSource, packId)

  if (
    !installRes.ok &&
    looksLikeInstallConflict(installRes.status, installText) &&
    process.env.CRIBL_DEPLOY_NO_CONFLICT_RETRY !== '1'
  ) {
    console.log('Install conflict detected — deleting existing pack and retrying registration once.')
    if (!(await deleteLeaderAppPack(baseUrl, token, packId))) {
      process.exitCode = 1
      return false
    }
    console.log(`POST ${baseUrl}/api/v1/apps (retry)`)
    ;({ res: installRes, text: installText } = await postRegisterPack(baseUrl, token, stagedSource, packId))
  }

  if (!installRes.ok) {
    console.error(`POST /api/v1/apps failed: HTTP ${installRes.status}`)
    console.error(installText.slice(0, 2000))
    process.exitCode = 1
    return false
  }

  if (looksLikeHtmlResponse(installText, installRes.headers.get('content-type'))) {
    console.error(explainWrongLeaderBase())
    console.error(installText.slice(0, 800))
    process.exitCode = 1
    return false
  }

  console.log(`Install response: ${installText.slice(0, 2000)}`)
  return true
}

async function main() {
  const token = process.env.CRIBL_API_TOKEN?.trim()
  const dry = process.env.CRIBL_DEPLOY_DRY_RUN === '1'

  const packagePath = await resolvePackagePath()
  const fst = await stat(packagePath)
  if (!fst.isFile()) throw new Error(`Not a file: ${packagePath}`)

  console.log(`Package: ${packagePath} (${(fst.size / (1024 * 1024)).toFixed(2)} MiB)`)

  const baseUrl = resolveDeployBaseUrl()
  if (!token || !baseUrl) {
    console.error(
      '\nMissing CRIBL_API_TOKEN or leader base URL.\n' +
        'Set CRIBL_API_TOKEN and CRIBL_DEPLOY_BASE_URL or CRIBL_E2E_BASE_URL\n' +
        '(workspace leader origin only, e.g. https://appplat-….cribl-staging.cloud).\n',
    )
    process.exitCode = 1
    return
  }

  const meta = await readPackageMeta()
  const packId = packIdFromMeta(meta)
  console.log(`Leader: ${baseUrl}`)
  console.log(`Pack id: ${packId}`)

  const expectedArchive = `${meta.name}-${meta.version}.tgz`
  if (basename(packagePath) !== expectedArchive) {
    console.warn(
      `Warning: archive file name ${basename(packagePath)} does not match package.json (${expectedArchive}); upload still uses this file; pack id follows package.json.`,
    )
  }

  if (dry) {
    console.log('CRIBL_DEPLOY_DRY_RUN=1 — skipping HTTP calls.')
    return
  }

  const ok = await criblLeaderDeployAppsPack(baseUrl, token, packagePath, packId)
  if (!ok || process.exitCode) return

  const verifyUrl = process.env.CRIBL_DEPLOY_VERIFY_URL?.trim()
  const skipVerify = process.env.CRIBL_DEPLOY_SKIP_VERIFY === '1'
  if (verifyUrl && !skipVerify) {
    console.log(`Polling verify URL:\n  ${verifyUrl}`)
    await pollUntilPackReady(verifyUrl, token)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
