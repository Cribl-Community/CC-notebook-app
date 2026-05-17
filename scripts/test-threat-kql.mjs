import { existsSync } from 'fs'
import { join } from 'path'
import dotenv from 'dotenv'

const root = process.cwd()
for (const p of ['e2e/.auth/captured-credentials.env', 'e2e/.env']) {
  if (existsSync(join(root, p))) dotenv.config({ path: join(root, p) })
}

const token = process.env.CRIBL_API_TOKEN
const base = (process.env.CRIBL_DEPLOY_BASE_URL || process.env.CRIBL_E2E_BASE_URL)?.replace(/\/$/, '')
const api = `${base}/api/v1`
const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

async function runQuery(label, q) {
  const query = q.startsWith('cribl') ? q : `cribl ${q}`
  console.log(`\n=== ${label} ===`)
  const created = await fetch(`${api}/m/default_search/search/jobs`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ query, earliest: '-7d', latest: 'now', sampleRate: 1 }),
  }).then((r) => r.json())
  if (created.status === 'error') {
    console.log('CREATE FAIL', JSON.stringify(created).slice(0, 600))
    return null
  }
  const id = created.items[0].id
  for (let i = 0; i < 80; i++) {
    const s = await fetch(`${api}/m/default_search/search/jobs/${id}/status`, { headers: h }).then((r) =>
      r.json(),
    )
    const st = s.items[0].status
    process.stdout.write(`${st} `)
    if (st === 'completed' || st === 'failed') break
    await new Promise((r) => setTimeout(r, 2000))
  }
  console.log()
  const res = await fetch(`${api}/m/default_search/search/jobs/${id}/results?limit=8`, { headers: h }).then((r) =>
    r.text(),
  )
  console.log(res.slice(0, 2000))
  return res
}

const pickIps = `dataset=cribl_search_sample
| where dataSource == "vpcflowlogs"
| where isnotnull(parse_ipv4(tostring(dstaddr))) and not(ipv4_is_private(tostring(dstaddr)))
| summarize flow_count = count() by ip_address = tostring(dstaddr)
| top 6 by flow_count desc`

const joinQ = `dataset=cribl_search_sample
| where dataSource == "vpcflowlogs"
| join kind=inner (
    dataset="$vt_lookups" lookupFile="notebook_vpc_external_watchlist"
  ) on $left.dstaddr == $right.ip_address
| timestats span=1h count() by ip_address`

const lookupQ = `dataset=cribl_search_sample
| where dataSource == "vpcflowlogs"
| lookup notebook_vpc_external_watchlist on dstaddr=ip_address
| timestats span=1h count() by ip_address`

await runQuery('A pick IPs', pickIps)
await runQuery('C join+timestats', joinQ)
await runQuery('C lookup+timestats', lookupQ)
