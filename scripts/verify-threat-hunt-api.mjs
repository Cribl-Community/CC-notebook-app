/**
 * Smoke: six external VPC dst IPs → lookup → join + timestats on cribl_search_sample.
 */
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
for (const p of [
  join(root, 'e2e/.auth/captured-credentials.env'),
  join(root, 'e2e/.env'),
]) {
  if (existsSync(p)) dotenv.config({ path: p })
}

const token = process.env.CRIBL_API_TOKEN?.trim()
const base = (process.env.CRIBL_DEPLOY_BASE_URL || process.env.CRIBL_E2E_BASE_URL)?.replace(/\/$/, '')

if (!token || !base) {
  console.error('Need CRIBL_API_TOKEN and CRIBL_E2E_BASE_URL / CRIBL_DEPLOY_BASE_URL')
  process.exit(1)
}

const api = `${base}/api/v1`
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function req(method, path, body) {
  const res = await fetch(`${api}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    json = { raw: text.slice(0, 2000) }
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} → ${res.status}`)
    err.body = json
    throw err
  }
  return json
}

async function pollJob(jobId) {
  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const res = await req('GET', `/m/default_search/search/jobs/${jobId}/status`)
    const job = res?.items?.[0] ?? res
    const status = job?.status
    if (status === 'completed') return job
    if (status === 'failed' || status === 'error') {
      throw new Error(`Job failed: ${JSON.stringify(job).slice(0, 1500)}`)
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  throw new Error('Job poll timeout')
}

async function runQuery(query) {
  const created = await req('POST', '/m/default_search/search/jobs', {
    query,
    earliest: '-7d',
    latest: 'now',
    sampleRate: 1,
  })
  const jobId = (created?.items?.[0] ?? created)?.id
  await pollJob(jobId)
  const res = await fetch(
    `${api}/m/default_search/search/jobs/${jobId}/results?limit=20`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return res.text()
}

const pickIpsQuery = `dataset=cribl_search_sample
| where dataSource == "vpcflowlogs"
| where isnotnull(parse_ipv4(tostring(dstaddr))) and not(ipv4_is_private(tostring(dstaddr)))
| summarize flow_count = count() by ip_address = tostring(dstaddr)
| top 6 by flow_count`

const timestatsQuery = `dataset=cribl_search_sample
| where dataSource == "vpcflowlogs"
| join kind=inner (
    dataset="$vt_lookups" lookupFile="notebook_vpc_external_watchlist"
  ) on $left.dstaddr == $right.ip_address
| timestats span=1h count() by ip_address
| limit 50`

async function main() {
  console.log('Pick 6 external IPs…')
  const pick = await runQuery(pickIpsQuery)
  console.log(pick.slice(0, 2000))
  if (!pick.includes('"ip_address"')) {
    console.error('FAIL: no ip_address in pick results')
    process.exit(1)
  }

  console.log('\nTimestats join path…')
  const ts = await runQuery(timestatsQuery)
  console.log(ts.slice(0, 2500))
  if (!ts.includes('ip_address')) {
    console.error('FAIL: timestats path returned no ip_address')
    process.exit(1)
  }
  console.log('\nOK')
}

main().catch((e) => {
  console.error(e.message)
  if (e.body) console.error(JSON.stringify(e.body, null, 2).slice(0, 3000))
  process.exit(2)
})
