#!/usr/bin/env node
/**
 * Downloads Cribl OpenAPI YAML from GitHub (criblio/cribl-openapi-spec) and emits
 * `src/features/cribl-api/generated/criblApiOpenApiIndex.json` for `%%cribl_api` completion.
 *
 * Environment:
 * - `CRIBL_OPENAPI_REF` — branch or tag (default `main`).
 * - `CRIBL_OPENAPI_CHANNEL` — `latest` (default) or `release`:
 *   - `latest`: `control-plane-dev.yml` + `mgmt-plane-prerelease.yml` (newest SDK-tracking specs).
 *   - `release`: `control-plane.yml` + `mgmt-plane.yml` (stable SDK sources per upstream README).
 *
 * @see https://github.com/criblio/cribl-openapi-spec
 */

import { parse as parseYaml } from 'yaml'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../src/features/cribl-api/generated')
const outFile = join(outDir, 'criblApiOpenApiIndex.json')

const REPO = 'criblio/cribl-openapi-spec'

function rawUrl(ref, specFile) {
  return `https://raw.githubusercontent.com/${REPO}/${ref}/specs/${specFile}`
}

async function resolveCommitSha(ref) {
  const u = `https://api.github.com/repos/${REPO}/commits/${encodeURIComponent(ref)}`
  const r = await fetch(u, {
    headers: {
      Accept: 'application/vnd.github+json',
      'user-agent': 'cribl-notebook-app-cribl-openapi-to-catalog',
    },
  })
  if (!r.ok) {
    process.stderr.write(`Warning: could not resolve commit for ${ref} (${r.status})\n`)
    return null
  }
  const j = await r.json()
  return typeof j?.sha === 'string' ? j.sha.slice(0, 12) : null
}

function sourcesForChannel(channel) {
  if (channel === 'release') {
    return [
      { name: 'control-plane', file: 'control-plane.yml' },
      { name: 'mgmt-plane', file: 'mgmt-plane.yml' },
    ]
  }
  return [
    { name: 'control-plane-dev', file: 'control-plane-dev.yml' },
    { name: 'mgmt-plane-prerelease', file: 'mgmt-plane-prerelease.yml' },
  ]
}

const HTTP = new Set(['get', 'post', 'put', 'patch', 'delete'])
const u = (m) => m.toUpperCase()
let dedupe

/**
 * Minimal JSON sample from an OpenAPI JSON Schema (for request bodies without examples).
 * @param {unknown} schema
 * @param {Record<string, unknown> | undefined} schemas components.schemas
 */
function schemaToSample(schema, schemas, depth = 0) {
  if (depth > 16) return {}
  if (!schema || typeof schema !== 'object') return {}
  const s = /** @type {Record<string, unknown>} */ (schema)
  if (typeof s.$ref === 'string') {
    const ref = s.$ref
    const name = ref.startsWith('#/components/schemas/') ? ref.slice('#/components/schemas/'.length) : ref.split('/').pop()
    const resolved = name && schemas && typeof schemas === 'object' ? schemas[name] : undefined
    if (resolved && typeof resolved === 'object') {
      return schemaToSample(resolved, schemas, depth + 1)
    }
    return {}
  }
  if (Array.isArray(s.allOf) && s.allOf.length > 0) {
    /** @type {Record<string, unknown>} */
    const merged = {}
    for (const part of s.allOf) {
      const sub = schemaToSample(part, schemas, depth + 1)
      if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
        Object.assign(merged, sub)
      }
    }
    if (Object.keys(merged).length > 0) return merged
  }
  if (Array.isArray(s.oneOf) && s.oneOf.length > 0) {
    return schemaToSample(s.oneOf[0], schemas, depth + 1)
  }
  if (Array.isArray(s.anyOf) && s.anyOf.length > 0) {
    return schemaToSample(s.anyOf[0], schemas, depth + 1)
  }

  const typ = s.type
  const types = Array.isArray(typ) ? typ : typ != null ? [typ] : []
  const concrete = types.filter((t) => t !== 'null')

  if (concrete.includes('object') || (typeof s.properties === 'object' && s.properties !== null)) {
    /** @type {Record<string, unknown>} */
    const out = {}
    const props = typeof s.properties === 'object' && s.properties !== null ? /** @type {Record<string, unknown>} */ (s.properties) : {}
    const req = Array.isArray(s.required) ? s.required : []
    for (const key of req) {
      const ps = props[key]
      out[key] = schemaToSample(ps, schemas, depth + 1)
    }
    return out
  }
  if (concrete.includes('array')) {
    return [schemaToSample(s.items, schemas, depth + 1)]
  }
  if (concrete.includes('string')) return ''
  if (concrete.includes('integer') || concrete.includes('number')) return 0
  if (concrete.includes('boolean')) return false
  return {}
}

/**
 * Request body sample: explicit examples first, else derive from application/json schema.
 * @param {unknown} requestBody
 * @param {unknown} components OpenAPI `components`
 */
function jsonSampleFromRequestBody(requestBody, components) {
  if (!requestBody || typeof requestBody !== 'object' || !('content' in requestBody)) {
    return undefined
  }
  const rb = /** @type {{ content?: Record<string, unknown> }} */ (requestBody)
  const jsonc = rb.content?.['application/json']
  if (!jsonc || typeof jsonc !== 'object') return undefined

  if ('example' in jsonc && jsonc.example !== undefined && jsonc.example !== null) {
    return jsonc.example
  }
  if (jsonc.examples && typeof jsonc.examples === 'object') {
    for (const v of Object.values(jsonc.examples)) {
      if (v && typeof v === 'object' && v !== null && 'value' in v) {
        const val = /** @type {{ value?: unknown }} */ (v).value
        if (val !== undefined && val !== null) return val
      }
    }
  }

  const schemas =
    components && typeof components === 'object' && 'schemas' in components && components.schemas && typeof components.schemas === 'object'
      ? /** @type {Record<string, unknown>} */ (components.schemas)
      : undefined
  const sch = jsonc.schema
  if (sch && typeof sch === 'object') {
    return schemaToSample(sch, schemas, 0)
  }
  return undefined
}

/** @param {unknown} spec */
function indexSpec(spec) {
  const out = []
  if (!spec || typeof spec !== 'object' || !('paths' in spec)) {
    return out
  }
  const paths = spec.paths
  if (!paths || typeof paths !== 'object') {
    return out
  }
  const components = spec.components && typeof spec.components === 'object' ? spec.components : undefined
  for (const [path, pathItem] of Object.entries(paths)) {
    if (typeof pathItem !== 'object' || !pathItem) {
      continue
    }
    for (const [method, op] of Object.entries(pathItem)) {
      const m = method.toLowerCase()
      if (!HTTP.has(m)) {
        continue
      }
      if (typeof op !== 'object' || !op) {
        continue
      }
      if (!('summary' in op) && !('operationId' in op)) {
        continue
      }
      const key = `${u(m)} ${path}`
      if (dedupe.has(key)) {
        continue
      }
      dedupe.add(key)
      const o = /** @type {Record<string, unknown> & { summary?: string; description?: string; requestBody?: unknown; operationId?: string }} */ (op)
      const summary =
        typeof o.summary === 'string' && o.summary
          ? o.summary
          : (typeof o.operationId === 'string' ? o.operationId : m)
      let description
      if (typeof o.description === 'string' && o.description) {
        description = o.description.replace(/<code>/g, '`').replace(/<\/code>/g, '`')
        if (description.length > 800) {
          description = description.slice(0, 797) + '…'
        }
      }
      /** @type {Record<string, unknown>} */
      const entry = {
        method: u(m),
        path,
        summary,
        ...(description ? { description } : {}),
      }
      const sample = jsonSampleFromRequestBody(o.requestBody, components)
      if (sample !== undefined && (m === 'post' || m === 'put' || m === 'patch' || m === 'delete')) {
        entry.jsonBody = sample
      }
      out.push(entry)
    }
  }
  return out
}

async function main() {
  const ref = process.env.CRIBL_OPENAPI_REF?.trim() || 'main'
  const channel = process.env.CRIBL_OPENAPI_CHANNEL === 'release' ? 'release' : 'latest'
  const sources = sourcesForChannel(channel)

  dedupe = new Set()
  const specVersions = []
  let all = []

  process.stderr.write(`Channel: ${channel} @ ${REPO}@${ref}\n`)

  const commitSha = await resolveCommitSha(ref)

  for (const s of sources) {
    const url = rawUrl(ref, s.file)
    process.stderr.write(`Fetching ${s.name} (${s.file})…\n`)
    const r = await fetch(url, {
      headers: { 'user-agent': 'cribl-notebook-app/1 (cribl-openapi-to-catalog)' },
    })
    if (!r.ok) {
      throw new Error(`HTTP ${r.status} for ${url}`)
    }
    const text = await r.text()
    const spec = parseYaml(text)
    if (spec?.info?.version) {
      specVersions.push(`${s.name}@${String(spec.info.version)}`)
    }
    all = all.concat(indexSpec(spec))
  }
  all.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method))
  const payload = {
    version: 1,
    source: `github:${REPO}`,
    channel,
    ref,
    ...(commitSha ? { repoCommit: commitSha } : {}),
    specVersions: [...new Set(specVersions)],
    generatedAt: new Date().toISOString(),
    operations: all,
  }
  await mkdir(outDir, { recursive: true })
  const json = JSON.stringify(payload)
  await writeFile(outFile, json, 'utf8')
  const kb = (Buffer.byteLength(json) / 1024).toFixed(1)
  process.stderr.write(`Wrote ${outFile} (${all.length} operations, ${kb} KiB)\n`)
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e) + '\n')
  process.exit(1)
})
