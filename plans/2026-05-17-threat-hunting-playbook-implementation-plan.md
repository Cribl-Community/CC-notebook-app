# Implementation Plan: Threat Hunting Playbook (IP reputation + enrichment join)

**Status:** In progress (branch `feature/threat-hunting-playbook`)  
**Chosen approach:** Bundled example notebook + platform enhancements to `%%cribl_search` (`timeout=`, verbose retrieval progress).  
**Primary data source:** [NERD (Network Entity Reputation Database)](https://nerd.liberouter.org/nerd/data/) — IP-only observations with separate malicious-IP enrichment.  
**Ingest:** **Main** → Generic HTTP **REST API dataset provider** + federated dataset (`%%cribl_api`). **Enrichment** → Cribl Search [`externaldata`](https://docs.cribl.io/search/externaldata/) + `%%cribl_save_search_lookup`. **No `config/proxies.yml` changes.**

---

## Goal

Deliver an end-to-end **cybersecurity threat hunting** example that:

1. Loads a **main set** of IP addresses (malicious and benign candidates) via a **REST API dataset provider (Generic HTTP)** and federated **dataset** — configured with `%%cribl_api`, queried with `%%cribl_search` / `dataset=…`.
2. Loads **enrichment** by fetching the malicious-IP list with **`externaldata`**, then **`%%cribl_save_search_lookup`** (Search fetches the URL; no pack proxy, no Pyodide `fetch` to NERD for the lookup).
3. Runs a **Cribl KQL hunt** with **`join`** against `$vt_lookups`.
4. Interprets results with **charts** and **markdown** (optional AI prompt).
5. Works on staging with **longer timeouts** and **visible progress** during slow Search jobs.

---

## Data source (concrete web example)

### Primary: NERD (CESNET)

| Role | File | URL | Format |
|------|------|-----|--------|
| **Main observations** | `ip_rep.csv` | https://nerd.liberouter.org/nerd/data/ip_rep.csv | `ip_address,reputation_score`. Mixed risk: high score ≈ malicious activity, low score ≈ benign/low risk. Project to **`ip_address`** for hunting; use `reputation_score` in KQL to discuss benign vs suspicious in narrative. |
| **Enrichment (malicious flag)** | `bad_ips.txt` | https://nerd.liberouter.org/nerd/data/bad_ips.txt | One IP per line; reputation **> 0.5**. Lookup columns: `ip_address`, `is_malicious`. |
| **Optional looser enrichment** | `bad_ips_med_conf.txt` | https://nerd.liberouter.org/nerd/data/bad_ips_med_conf.txt | Score **> 0.2**; document FP trade-off. |

**Explicit benign candidates in main set:** NERD `ip_rep.csv` is not a balanced allowlist. The notebook should document **benign examples** in the main dataset via:

- IPs with **low** `reputation_score` in `ip_rep.csv`, and/or  
- A **second Generic HTTP endpoint** on the same provider (or a one-row inline note) for known-good resolver IPs (`1.1.1.1`, `8.8.8.8`, etc.) if the spike supports multiple endpoints — otherwise call out low-score rows + resolver IPs in interpretation cells.

**Why NERD:** IP-only main surface + separate enrichment lookup; fits join-based hunting.

### How data enters the notebook

| Layer | Mechanism | Source |
|-------|-----------|--------|
| **Main IP set** | `%%cribl_api` create **Generic HTTP dataset provider** + **federated dataset** → hunt with `dataset="notebook_nerd_ips"` | Provider endpoint URL → `ip_rep.csv` ([Cribl Generic HTTP API](https://docs.cribl.io/search/set-up-generic-http-api/)) |
| **Enrichment lookup** | `%%cribl_search` **`externaldata`** → Python normalize → `%%cribl_save_search_lookup` | `bad_ips.txt` (Anomaly notebook pattern; verbatim query, no `cribl` prefix) |

**Reference:** `public/Examples/Cribl_API_Examples.ipynb` (REST jobs), `Cribl_Search_Lookup_Magics.ipynb` (lookups), `Anomaly_Detection_PyOD.ipynb` (`externaldata` only for enrichment feed).

---

## Main observations via REST API dataset provider (required)

### 1. Dataset provider (`%%cribl_api`)

Spike confirms exact paths under `/m/default_search/…` (or contextual group). Conceptual setup:

| Field | Value |
|-------|--------|
| Provider ID | `notebook_nerd_http` (example) |
| Type | Generic HTTP API |
| Endpoint name | `ip_reputation` |
| URL | `https://nerd.liberouter.org/nerd/data/ip_rep.csv` |
| Method | GET |
| Auth | None |
| Data field | _(blank if CSV body is row-oriented, or per spike)_ |

### 2. Federated dataset (`%%cribl_api`)

| Field | Value |
|-------|--------|
| Dataset ID | `notebook_nerd_ips` |
| Provider | `notebook_nerd_http` |
| Endpoint(s) | `ip_reputation` |

### 3. Verify & sample main data

```kusto
%%cribl_search var=main_preview timeout=120000 verbose=true
dataset="notebook_nerd_ips"
| project ip_address, reputation_score
| limit 500
```

Use `timeout=` / `verbose=true` because HTTP dataset queries can be slow (OOB fetch inside Search).

### 4. Malicious + benign in the main set

- **Malicious candidates:** rows with high `reputation_score` and/or IPs that also appear in the enrichment lookup after the join.  
- **Benign candidates:** rows with low `reputation_score`; optionally highlight known resolver IPs in markdown (not required to be in `ip_rep.csv` if absent).

**Do not** use `externaldata` for `ip_rep.csv` on the happy path — that path is reserved for enrichment only.

---

## Enrichment lookup via `externaldata` (required)

### Flow

1. **`%%cribl_search`** with `timeout=` / `verbose=true`:

```kusto
externaldata
[
  "https://nerd.liberouter.org/nerd/data/bad_ips.txt"
]
with(
  datatype="CSV"
)
| limit 10000
```

(Validate `datatype` and `.txt` parsing on staging; Python fallback if columns are `_raw` / `Event`.)

2. **Python** — `ip_address`, `is_malicious` (= `1`); skip `#` comment lines.

3. **`%%cribl_save_search_lookup`** `notebook_nerd_malicious.csv` `replace=true`

4. **Verify:** `dataset="$vt_lookups" lookupFile="notebook_nerd_malicious" | limit 10`

### Why not `proxies.yml`

Both the provider-backed dataset fetch and `externaldata` run **inside Cribl Search**, not via Pyodide pack proxy. **Do not add** `nerd.liberouter.org` to `config/proxies.yml`.

---

## Hunt KQL (join)

```kusto
dataset="notebook_nerd_ips"
| project ip_address, reputation_score
| join kind=leftouter (
    dataset="$vt_lookups" lookupFile="notebook_nerd_malicious"
) on $left.ip_address == $right.ip_address
| extend is_malicious = isnotnull(ip_address1)
| where is_malicious == true
```

Optional follow-on: `where is_malicious == false` or `reputation_score < 0.2` to surface **benign candidates** in the main set.

Adjust join keys after lookup schema is fixed on staging.

---

## Staging / E2E fallback

When provider POST fails (permissions) or NERD is unreachable from Search:

- **Main:** `dataset=cribl_search_sample` (`srcaddr` or similar as IP stand-in).
- **Enrichment:** synthetic inline CSV → `%%cribl_save_search_lookup`.
- Same **join** + viz structure; provider cells marked manual / skip in automated Run All.

---

## Platform prerequisites (blocking)

Today `%%cribl_search` has **no `timeout=`**; client job control `fetch` aborts at **30s** (`SEARCH_FETCH_TIMEOUT_MS`). HTTP dataset + `externaldata` jobs can exceed that.

### A) `timeout=` on `%%cribl_search`

| Layer | Change |
|-------|--------|
| `criblSearchMagic.ts` | Parse `timeout=<ms>` or `timeout=<N>s`. |
| `SearchService.ts` / `searchJobs.ts` | Pass through to job create + per-request abort (**spike:** API field name, e.g. OOB timeout). |
| `criblSearchExecutor.ts` | Forward from magic. |
| Tests | Parser + `searchJobs` tests. |

**Notebook:** Provider preview, enrichment `externaldata`, and hunt cells use e.g. `timeout=120000 verbose=true`.

### B) Verbose data retrieval progress

Richer poll/pagination labels + optional `verbose=true` mirrored to stdout.

**Acceptance:** Provider dataset load and `externaldata` show a clear progress timeline.

---

## Notebook: `Threat_Hunting_Playbook.ipynb`

**Location:** `public/Examples/Threat_Hunting_Playbook.ipynb`  
**Metadata:** `vite.examplesManifestPlugin.ts` — tags `security`, `threat-hunting`, `search`, `api`, `lookups`, `externaldata`; level `intermediate`; `recommendedOrder` ~3–4.

### Cell outline

| # | Section | Mechanism |
|---|---------|-----------|
| 1 | Prerequisites | Hosted Cribl Search; permissions for dataset providers; NERD fair use; lookup ≤10k; `timeout=` / `verbose=true` |
| 2 | Hunt scenario | Main IP dataset (mixed risk) + enrichment marking confirmed malicious |
| 3 | **Create Generic HTTP provider** | `%%cribl_api` POST/PUT provider → `ip_rep.csv` |
| 4 | **Create federated dataset** | `%%cribl_api` → `notebook_nerd_ips` |
| 5 | **Verify main dataset** | `%%cribl_search` `dataset="notebook_nerd_ips"` preview (scores + IPs) |
| 6 | **Enrichment via `externaldata`** | `%%cribl_search` → `bad_ips.txt` |
| 7 | **Save lookup** | Python → `%%cribl_save_search_lookup notebook_nerd_malicious.csv` |
| 8 | Verify lookup | `$vt_lookups` preview |
| 9 | **Hunt** | `join` main dataset to lookup; `timeout=` / `verbose=true` |
| 10 | Checkpoint | Match rate, benign vs malicious counts |
| 11 | Visualizations | Matplotlib |
| 12 | Interpretation | Markdown + NERD FP caveats |
| 13 | Optional AI | Prompt on `hunt_hits` |
| 14 | Cleanup | Delete lookup; optional DELETE provider/dataset |
| 15 | Fallback | `cribl_search_sample` + synthetic lookup |
| 16 | Next steps | `Cribl_API_Examples.ipynb`, `Cribl_Search_Lookup_Magics.ipynb`, `Anomaly_Detection_PyOD.ipynb` |

---

## Config & catalog

| Item | Action |
|------|--------|
| `config/proxies.yml` | **No changes.** |
| `criblApiSearchContextOverrides.data.ts` | **Required after spike:** Generic HTTP provider + federated dataset routes with sample `jsonBody` for `%%cribl_api` completions. |
| `releaseNotes.ts` | On version bump only. |

---

## Testing

| Test | Scope |
|------|--------|
| `npm test` | `timeout` / `verbose`; ipynb parse |
| Manual staging | Provider → dataset → `externaldata` lookup → join hunt |
| E2E optional | `@slow`; fallback if provider POST blocked |

---

## Ordered sub-tasks

### 1. Spike (blocking)

- REST paths + JSON for **Generic HTTP provider** and **federated dataset** (`default_search`).
- Cribl job **timeout / OOB** field on `POST …/search/jobs`.
- Provider query against `ip_rep.csv`: column names, row volume, sensible `limit`.
- `externaldata` on `bad_ips.txt` only: datatype + Python parse.
- Hunt join on staging.

**Acceptance:** Copy-pasteable `%%cribl_api` bodies + working hunt KQL.

### 2. Platform — `timeout=` on `%%cribl_search`

### 3. Platform — verbose retrieval progress

### 4. Catalog overrides (provider + dataset)

### 5. Author `Threat_Hunting_Playbook.ipynb`

**Acceptance:** Main IPs **only** via REST provider + dataset; enrichment **only** via `externaldata` → lookup; no `proxies.yml`.

### 6. Example manifest metadata

### 7. Optional E2E

---

## Dependency graph

```
Spike (provider + externaldata + hunt)
    ├── Platform timeout=
    ├── Platform verbose progress
    ├── Catalog overrides (provider/dataset)
    └── Notebook
            └── Manifest + E2E
```

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Client 30s abort | `timeout=` + job API timeout (spike) |
| Provider POST 403 on staging | Fallback `cribl_search_sample`; E2E skip provider cells |
| `ip_rep.csv` too large | `limit` in hunt KQL; provider processing rules if available |
| Lookup > 10k rows | `\| limit 10000` on `externaldata` |
| `bad_ips.txt` → `_raw` column | Python line parser |
| Search cannot reach NERD URLs | Document tenant egress; fallback lookup |
| Join key drift | Checkpoint cell |

---

## Out of scope

- `proxies.yml` changes.
- `externaldata` for **main** `ip_rep.csv` (main is provider-only).
- Pyodide download of NERD feeds.
- Pre-executed notebook outputs.

---

## Definition of done

- [ ] `timeout=` and verbose progress shipped with tests.
- [ ] Main IP set loaded via **Generic HTTP REST API dataset provider** + **`notebook_nerd_ips`** dataset.
- [ ] Enrichment via **`externaldata`** → `%%cribl_save_search_lookup`.
- [ ] KQL **join** hunt + viz + fallback documented.
- [ ] Catalog overrides for provider/dataset API paths.
- [ ] **No** `proxies.yml` diff.
- [ ] `npm test` green; staging Run All documented.
