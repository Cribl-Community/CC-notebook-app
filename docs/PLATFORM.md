# Cribl App Platform integration

**Single source of truth** for how this app talks to the Cribl App Platform:
injected globals, the transparent `fetch` proxy, the scoped KV store, config-group
context, and `config/proxies.yml`. [`CLAUDE.md`](../CLAUDE.md) and
[`AGENTS.md`](../AGENTS.md) link here instead of repeating these rules.

The app runs as a **widget inside a sandboxed iframe** in the Cribl UI (built as a
`.tgz` Cribl App). It has **no direct network credentials** — the parent window
proxies and authenticates every Cribl API call for you.

## Injected globals (`window.*`)

The platform sets these on `window` when the app runs inside Cribl. They are
read-only and always present in a real deployment.

| Global | Example | Description |
|---|---|---|
| `CRIBL_API_URL` | `https://localhost:9000/api/v1` | Base URL for all Cribl API calls |
| `CRIBL_BASE_PATH` | `/app-ui/my-app` | Mount path for this app (React Router basename) |
| `getCriblUser` | `() => { id, username, … }` | Optional. When present and it resolves a user with non-empty `id` + `username`, the notebook library is scoped per-user (see [KV store](#key-value-store)) |

Environment detection lives in `src/platform/env/env.ts` (`getCriblApiBase`,
`isKvMockMode`, `readEnv`) and is exposed to features via `EnvProvider` / `useEnv`.

## How API calls work (fetch proxy)

The platform **intercepts every `fetch()` call to `CRIBL_API_URL`** and proxies it
through the parent window. This is transparent — call `fetch()` normally.

What the proxy does for you:

- Injects authentication headers (app code never sees or handles tokens).
- Rewrites URLs to scope requests to this app's pack.
- Streams responses back into the iframe.

What this means for app code:

- Use `fetch()` normally — auth just works.
- You cannot override or replace `window.fetch` (it is locked).
- Requests that do **not** target `CRIBL_API_URL` are passed through directly (no proxy).

### URL rewriting rules

| What you call | What actually happens | Why |
|---|---|---|
| `CRIBL_API_URL + '/kvstore/my-key'` | `/api/v1/p/{packId}/kvstore/my-key` | Scopes KV to this pack |
| `CRIBL_API_URL + '/proxy/some/path'` | `/api/v1/p/{packId}/proxy/some/path` | Scopes proxy calls to this pack |
| `fetch('https://api.example.com/data')` | `/api/v1/p/{packId}/proxy/api.example.com/data` | External calls route through the pack proxy |
| `CRIBL_API_URL + '/search/jobs'` | passed through unchanged | Standard API calls are not rewritten |

The app cannot access other packs' resources — requests targeting a different pack
id are rejected.

### Request timeout

Proxied requests time out after **30 seconds** if no response is received. Use
`AbortController` to cancel earlier.

## Key-value store

Each app has a scoped KV store. Use `CRIBL_API_URL` as the base — the proxy handles
scoping. Client code lives in `src/platform/cribl/kvstore.ts`; the notebook library
adapter is `src/platform/adapters/notebookKv.ts`.

| Operation | Method | URL | Body |
|---|---|---|---|
| Get | GET | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | — |
| Set | PUT | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | value |
| Delete | DELETE | `CRIBL_API_URL + '/kvstore/the/path/to/key'` | — |
| List keys | POST | `CRIBL_API_URL + '/kvstore/keys'` | `{ prefix: 'my/key/prefix' }` |

**Notebook library keys.** Saved notebooks (manifest + `.ipynb` payloads) use keys
under `nb/v1/…`. When `window.getCriblUser` resolves to a user with non-empty `id`
and `username`, the library is stored per-user under
`nb/v1/u/{encodeURIComponent(id)}/{encodeURIComponent(username)}/…` so each user sees
only their own notebooks. If `getCriblUser` is missing, throws, or returns incomplete
data, the app falls back to the legacy pack-wide `nb/v1/…` paths. Existing pack-wide
data is **not** migrated automatically.

## Config-group context

Cribl REST endpoints that do **not** begin with `/system/` are contextual and are
scoped to a config group with the prefix `/m/{groupId}`. List groups via
`/master/groups`.

- **Search endpoints (`/search/…`) must always use `groupId = default_search`** — for
  example `/m/default_search/search/jobs`. Never use any other group id for search.

When building a feature, inspect the Cribl REST API and confirm the request context
before starting.

## External APIs (`config/proxies.yml`)

Every external domain the app calls with `fetch()` must be declared in
`config/proxies.yml`. The platform validates this at install time (so admins see
exactly which endpoints the app reaches), routes external calls through the pack
proxy, and applies these guarantees: HTTPS only, private/reserved IPs blocked
(SSRF protection), and a per-pack rate limit of **100 requests/minute**.

Sensitive headers (`cookie`, `authorization`, `proxy-authorization`, `host`,
`connection`, `transfer-encoding`) are always stripped from the original request —
use `headers.inject` to set auth headers instead.

### Schema

```yaml
# config/proxies.yml
# Top-level keys are domain:port pairs (port optional, defaults to 443).

api.example.com:
  timeout: 10000            # Optional request timeout in ms (1000–120000, default 30000)

  paths:                    # Optional path controls (prefix match)
    allowlist:              # Request path must start with one of these
      - /v1/chat/
      - /v1/models
    blocklist:              # Always blocked (takes precedence over allowlist)
      - /v1/admin/

  headers:                  # Optional header controls
    inject:                 # Added to every outgoing request to this domain
      x-api-key: "'static-key'"
      Authorization: "'Bearer ' + kv.myApiKey"
      x-custom: kv.myHeaderValue
    allowlist:              # Only forward these request headers (supports wildcards)
      - content-type
      - accept
      - x-custom-*
    blocklist:              # Never forward these (takes precedence, supports wildcards)
      - x-internal-*
```

**Header-injection expressions** support string literals (`"'static'"`), encrypted KV
lookups (`kv.mySecretKey`, resolved at request time), and concatenation
(`"'Bearer ' + kv.apiToken"`).

**How it connects to `fetch`:** calling `fetch('https://api.openai.com/v1/chat/completions', …)`
is rewritten to `/api/v1/p/{packId}/proxy/api.openai.com/v1/chat/completions`; the
platform looks up `api.openai.com` in `proxies.yml`, validates the path, injects
headers, and forwards the request.

### Pyodide package hosts

The Pyodide interpreter loads from the app origin, but extra wheels (e.g. after
`import matplotlib`, or `micropip.install(...)`) are fetched from external hosts that
**must stay declared** in `config/proxies.yml`:

- `cdn.jsdelivr.net` — the full Pyodide distribution; the allowlisted path version
  must match `PYODIDE_RELEASE` (enforced by
  `src/features/welcome/proxiesConfig.test.ts`).
- `pypi.org`, `files.pythonhosted.org` — micropip wheels from the PyPI simple index
  and file storage.

Notebook examples that call third-party APIs (e.g. `backend.composio.dev`) also
declare their host + path allowlist here. See
[`PYODIDE_CUSTOMIZATIONS.md`](./PYODIDE_CUSTOMIZATIONS.md) for the per-package pinning
rationale and how KV-backed `headers.inject` auth works with the kernel fetch bridge.

## React Router

Set the router basename to `window.CRIBL_BASE_PATH`:

```jsx
<BrowserRouter basename={window.CRIBL_BASE_PATH}>
```

## Navigation sync

The platform synchronizes navigation between the app and the parent Cribl UI:
`history.pushState()` / `history.replaceState()` updates the parent URL bar, and
navigation from the parent is forwarded into the app as `popstate` events.

## API definitions

Cribl REST API endpoint definitions are available in `openapi.json` at the repo root
(if it was downloaded during project setup). The `%%cribl_api` cell magic builds its
path-completion catalog from a generated index under
`src/features/cribl-api/generated/` (regenerate with `npm run update:cribl-api`).
