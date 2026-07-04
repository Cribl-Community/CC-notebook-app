#!/usr/bin/env node
/**
 * Build curated Windows telemetry CSVs for Process_Lineage_Sigma_Hunt.ipynb.
 *
 * Reproduces the sample inputs of https://github.com/MohitDabas/sigmalineage-mcp
 * (Chainsaw Sigma hits + Sysmon/Security process events + rarity telemetry) as flat CSVs
 * so the notebook can trace process lineage and compute a rarity baseline in-kernel
 * (pandas + networkx) — Chainsaw and raw .evtx parsing cannot run in Pyodide.
 *
 * Emits teaching samples under public/data/process-lineage/ (local mirror only — Cribl
 * Search cannot read app-pack /data/ at runtime). Copy the outputs to
 * https://github.com/michaelhyatt/notebook-app-example-data (process-lineage/); bundled
 * notebooks load them from raw.githubusercontent.com and the paths must match
 * src/domain/exampleDataUrls.ts.
 *
 * Run: node scripts/build-process-lineage-samples.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'public', 'data', 'process-lineage')

const SYSMON_CHANNEL = 'Microsoft-Windows-Sysmon/Operational'
const SECURITY_CHANNEL = 'Security'

/**
 * Cribl Search `externaldata` with `datatype="CSV Datatypes"` silently drops every row
 * when a column value looks like an ISO datetime with seconds (e.g. `2026-06-30T08:14:59Z`).
 * Minute precision (`2026-06-30T08:14`) parses correctly.
 */
function formatUtcTimeForExternalData(iso) {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(String(iso))
  return m ? m[1] : String(iso)
}

/** Deterministic Sysmon-style ProcessGuid from a host + pid (no `{}` — braces break Search CSV Datatypes). */
function guid(host, pid) {
  const h = host.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase().padEnd(8, '0')
  return `PL${h}-0000-0000-0000-${String(pid).padStart(12, '0')}`
}

/**
 * Process-creation events. `parentPid` links to another row's `pid` on the same host.
 * When `eid === 4688` (Security log) we omit ProcessGuid/ParentProcessGuid so the notebook
 * exercises the (Computer, ParentProcessId, time) fallback — like sigma_lineage.find_parent_key.
 */
const PROC_EVENTS = [
  // --- WIN-DC01: benign boot chain, then a WMI -> PowerShell -> rundll32 attack chain ---
  { t: '2026-06-30T01:02:03Z', host: 'WIN-DC01', user: 'NT AUTHORITY\\SYSTEM', eid: 1, pid: 512, image: 'C:\\Windows\\System32\\wininit.exe', cmd: 'wininit.exe', parentPid: 0, parentImage: '', parentCmd: '' },
  { t: '2026-06-30T01:02:04Z', host: 'WIN-DC01', user: 'NT AUTHORITY\\SYSTEM', eid: 1, pid: 780, image: 'C:\\Windows\\System32\\services.exe', cmd: 'services.exe', parentPid: 512, parentImage: 'C:\\Windows\\System32\\wininit.exe', parentCmd: 'wininit.exe' },
  { t: '2026-06-30T01:02:06Z', host: 'WIN-DC01', user: 'NT AUTHORITY\\SYSTEM', eid: 1, pid: 1080, image: 'C:\\Windows\\System32\\svchost.exe', cmd: 'svchost.exe -k DcomLaunch -p', parentPid: 780, parentImage: 'C:\\Windows\\System32\\services.exe', parentCmd: 'services.exe' },
  { t: '2026-06-30T08:14:52Z', host: 'WIN-DC01', user: 'NT AUTHORITY\\NETWORK SERVICE', eid: 1, pid: 2340, image: 'C:\\Windows\\System32\\wbem\\WmiPrvSE.exe', cmd: 'C:\\Windows\\system32\\wbem\\wmiprvse.exe -secured -Embedding', parentPid: 1080, parentImage: 'C:\\Windows\\System32\\svchost.exe', parentCmd: 'svchost.exe -k DcomLaunch -p' },
  // HIT: WMI provider spawns an encoded PowerShell
  { t: '2026-06-30T08:14:59Z', host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 1, pid: 4512, image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', cmd: 'powershell.exe -nop -w hidden -enc SQBFAFgAKABOAGUAdwAtAE8AYgBqAGUAYwB0ACAATgBlAHQALgBXAGUAYgBDAGwAaQBlAG4AdAApAA==', parentPid: 2340, parentImage: 'C:\\Windows\\System32\\wbem\\WmiPrvSE.exe', parentCmd: 'wmiprvse.exe -secured -Embedding' },
  // HIT: PowerShell drops + runs a DLL from ProgramData via rundll32
  { t: '2026-06-30T08:15:03Z', host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 1, pid: 5120, image: 'C:\\Windows\\System32\\rundll32.exe', cmd: 'rundll32.exe C:\\ProgramData\\update\\svc.dll,StartW', parentPid: 4512, parentImage: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', parentCmd: 'powershell.exe -nop -w hidden -enc SQBFAFgA...' },
  // Security-log (EID 4688) children with no GUID -> notebook links them by (host, parentPid, time)
  { t: '2026-06-30T08:15:07Z', host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 4688, pid: 6100, image: 'C:\\Windows\\System32\\cmd.exe', cmd: 'cmd.exe /c whoami /all', parentPid: 5120, parentImage: 'C:\\Windows\\System32\\rundll32.exe', parentCmd: 'rundll32.exe C:\\ProgramData\\update\\svc.dll,StartW' },
  { t: '2026-06-30T08:15:08Z', host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 4688, pid: 6220, image: 'C:\\Windows\\System32\\whoami.exe', cmd: 'whoami /all', parentPid: 6100, parentImage: 'C:\\Windows\\System32\\cmd.exe', parentCmd: 'cmd.exe /c whoami /all' },

  // --- WIN-WKS07: benign interactive workstation activity (noise / baseline) ---
  { t: '2026-06-30T07:55:10Z', host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 1, pid: 2100, image: 'C:\\Windows\\explorer.exe', cmd: 'explorer.exe', parentPid: 2000, parentImage: 'C:\\Windows\\System32\\userinit.exe', parentCmd: 'userinit.exe' },
  { t: '2026-06-30T07:56:00Z', host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 1, pid: 4800, image: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', cmd: 'chrome.exe', parentPid: 2100, parentImage: 'C:\\Windows\\explorer.exe', parentCmd: 'explorer.exe' },
  { t: '2026-06-30T07:57:30Z', host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 1, pid: 5300, image: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE', cmd: 'OUTLOOK.EXE', parentPid: 2100, parentImage: 'C:\\Windows\\explorer.exe', parentCmd: 'explorer.exe' },
  { t: '2026-06-30T08:05:12Z', host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 1, pid: 6010, image: 'C:\\Windows\\System32\\notepad.exe', cmd: 'notepad.exe C:\\Users\\alice\\notes.txt', parentPid: 2100, parentImage: 'C:\\Windows\\explorer.exe', parentCmd: 'explorer.exe' },
]

const PROC_COLUMNS = [
  'UtcTime', 'Computer', 'User', 'EventID', 'Channel',
  'ProcessGuid', 'ProcessId', 'Image', 'CommandLine',
  'ParentProcessGuid', 'ParentProcessId', 'ParentImage', 'ParentCommandLine',
]

function buildProcessRows() {
  return PROC_EVENTS.map((e) => ({
    UtcTime: formatUtcTimeForExternalData(e.t),
    Computer: e.host,
    User: e.user,
    EventID: e.eid,
    Channel: e.eid === 4688 ? SECURITY_CHANNEL : SYSMON_CHANNEL,
    ProcessGuid: e.eid === 4688 ? '' : guid(e.host, e.pid),
    ProcessId: e.pid,
    Image: e.image,
    CommandLine: e.cmd,
    ParentProcessGuid: e.eid === 4688 || !e.parentPid ? '' : guid(e.host, e.parentPid),
    ParentProcessId: e.parentPid,
    ParentImage: e.parentImage,
    ParentCommandLine: e.parentCmd,
  }))
}

/** Precomputed Chainsaw/Sigma hits (join to process events on ProcessGuid, else Computer+ProcessId+UtcTime). */
const SIGMA_HITS = [
  { rule_name: 'Malicious PowerShell Encoded Command', level: 'high', host: 'WIN-DC01', pid: 4512, t: '2026-06-30T08:14:59Z', image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', cmd: 'powershell.exe -nop -w hidden -enc SQBFAFgA...' },
  { rule_name: 'Windows Shell Spawned By WMI Provider', level: 'high', host: 'WIN-DC01', pid: 4512, t: '2026-06-30T08:14:59Z', image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', cmd: 'powershell.exe -nop -w hidden -enc SQBFAFgA...' },
  { rule_name: 'Rundll32 Execution From ProgramData', level: 'high', host: 'WIN-DC01', pid: 5120, t: '2026-06-30T08:15:03Z', image: 'C:\\Windows\\System32\\rundll32.exe', cmd: 'rundll32.exe C:\\ProgramData\\update\\svc.dll,StartW' },
]

const HIT_COLUMNS = ['rule_name', 'level', 'ProcessGuid', 'ProcessId', 'Computer', 'UtcTime', 'Image', 'CommandLine']

function buildHitRows() {
  return SIGMA_HITS.map((h) => ({
    rule_name: h.rule_name,
    level: h.level,
    ProcessGuid: guid(h.host, h.pid),
    ProcessId: h.pid,
    Computer: h.host,
    UtcTime: formatUtcTimeForExternalData(h.t),
    Image: h.image,
    CommandLine: h.cmd,
  }))
}

/**
 * Mixed telemetry for the rarity baseline (network EID 3, logon EID 4624, DNS/URL EID 22).
 * `n` repeats a row so common tuples build a baseline and malicious tuples stay rare
 * (baseline_count <= 2). Families: process|dst_port|protocol, user|channel|event_id, url|host|process.
 */
const TELEMETRY = [
  // Common network (baseline)
  { n: 8, host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 3, image: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', port: 443, proto: 'tcp', dhost: 'clients.google.com' },
  { n: 5, host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 3, image: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE', port: 443, proto: 'tcp', dhost: 'outlook.office365.com' },
  { n: 6, host: 'WIN-DC01', user: 'NT AUTHORITY\\SYSTEM', eid: 3, image: 'C:\\Windows\\System32\\svchost.exe', port: 443, proto: 'tcp', dhost: 'ctldl.windowsupdate.com' },
  { n: 5, host: 'WIN-DC01', user: 'NT AUTHORITY\\SYSTEM', eid: 3, image: 'C:\\Windows\\System32\\svchost.exe', port: 53, proto: 'udp', dhost: 'dns.msftncsi.com' },
  // Rare network (malicious C2 / staging)
  { n: 1, host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 3, image: 'C:\\Windows\\System32\\rundll32.exe', port: 4444, proto: 'tcp', dhost: '185.220.101.45' },
  { n: 2, host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 3, image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', port: 8443, proto: 'tcp', dhost: 'cdn-update-server.net' },

  // Common logon (baseline)
  { n: 6, host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 4624, channel: SECURITY_CHANNEL },
  { n: 5, host: 'WIN-DC01', user: 'WIN-DC01\\administrator', eid: 4624, channel: SECURITY_CHANNEL },
  // Rare logon (service account interactive logon)
  { n: 1, host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 4624, channel: SECURITY_CHANNEL },

  // Common URL/DNS (baseline)
  { n: 5, host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 22, image: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', url: 'https://www.google.com/' },
  { n: 4, host: 'WIN-WKS07', user: 'WIN-WKS07\\alice', eid: 22, image: 'C:\\Program Files\\Microsoft Office\\root\\Office16\\OUTLOOK.EXE', url: 'https://outlook.office365.com/' },
  // Rare URL (C2 beacon / payload)
  { n: 1, host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 22, image: 'C:\\Windows\\System32\\rundll32.exe', url: 'http://185.220.101.45/gate.php' },
  { n: 2, host: 'WIN-DC01', user: 'WIN-DC01\\svc_backup', eid: 22, image: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', url: 'http://cdn-update-server.net/p.dll' },
]

const TELEMETRY_COLUMNS = [
  'UtcTime', 'Computer', 'User', 'EventID', 'Channel', 'Image',
  'DestinationPort', 'Protocol', 'DestinationHostname', 'url',
]

function buildTelemetryRows() {
  const rows = []
  let sec = 0
  for (const e of TELEMETRY) {
    for (let i = 0; i < e.n; i += 1) {
      sec += 1
      const ts = formatUtcTimeForExternalData(
        new Date(Date.UTC(2026, 5, 30, 8, 20, sec % 60, 0)).toISOString().replace('.000', ''),
      )
      rows.push({
        UtcTime: ts,
        Computer: e.host,
        User: e.user ?? '',
        EventID: e.eid,
        Channel: e.channel ?? SYSMON_CHANNEL,
        Image: e.image ?? '',
        DestinationPort: e.port ?? '',
        Protocol: e.proto ?? '',
        DestinationHostname: e.dhost ?? '',
        url: e.url ?? '',
      })
    }
  }
  return rows
}

/** RFC4180 + quote Windows paths/users (backslashes break Search CSV Datatypes). */
function csvEscape(v) {
  const s = String(v ?? '')
  if (/[",\n\r\\]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows, columns) {
  const lines = [columns.join(',')]
  for (const row of rows) lines.push(columns.map((c) => csvEscape(row[c])).join(','))
  return `${lines.join('\n')}\n`
}

async function main() {
  const procRows = buildProcessRows()
  const hitRows = buildHitRows()
  const telemetryRows = buildTelemetryRows()

  // Every hit must resolve to a process event (by ProcessGuid or Computer+ProcessId).
  const procKeys = new Set(procRows.map((r) => `${r.Computer}:${r.ProcessId}`))
  const orphanHits = hitRows.filter((h) => !procKeys.has(`${h.Computer}:${h.ProcessId}`))
  if (orphanHits.length > 0) {
    console.error(`Sigma hits without a matching process event: ${orphanHits.map((h) => h.rule_name).join(', ')}`)
    process.exit(1)
  }

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(join(OUT_DIR, 'windows_process_events.csv'), toCsv(procRows, PROC_COLUMNS), 'utf8')
  await writeFile(join(OUT_DIR, 'sigma_hits.csv'), toCsv(hitRows, HIT_COLUMNS), 'utf8')
  await writeFile(join(OUT_DIR, 'windows_telemetry_events.csv'), toCsv(telemetryRows, TELEMETRY_COLUMNS), 'utf8')

  console.log(`Wrote ${procRows.length} process events, ${hitRows.length} Sigma hits, ${telemetryRows.length} telemetry rows`)
  console.log(`Output: ${OUT_DIR}`)
  console.log('Publish to https://github.com/michaelhyatt/notebook-app-example-data under process-lineage/')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
