import { getCriblApiBase } from '@platform/env/env'
import { describeFetchError } from '@platform/cribl/fetchFailure'

function mergeRequestHeaders(
  part: { headers: Record<string, string>; body: string | undefined; bodyIsJson: boolean },
): Record<string, string> {
  const h = { ...part.headers }
  if (part.body != null && part.bodyIsJson) {
    const k = 'content-type'
    if (!Object.keys(h).some((x) => x.toLowerCase() === k)) {
      h['Content-Type'] = 'application/json'
    }
  }
  return h
}

export type CriblApiHttpResult = {
  status: number
  ok: boolean
  text: string
  /** Populated when response looks like JSON and `Accept`/body suggests JSON. */
  jsonValue: unknown | null
}

/**
 * Call the Cribl control-plane API relative to `getCriblApiBase()`.
 * Authentication is applied by the platform fetch proxy; callers do not set auth headers in app code.
 */
export async function callCriblApi(
  method: string,
  path: string,
  part: { headers: Record<string, string>; body: string | undefined; bodyIsJson: boolean },
  getBase: () => string = getCriblApiBase,
): Promise<CriblApiHttpResult> {
  const base = getBase()
  if (!base) {
    throw new Error(
      'No CRIBL_API_URL: %%cribl_api runs in the Cribl App Platform. Use a deployed app or a dev shell that sets window.CRIBL_API_URL.',
    )
  }
  const url = base + path
  const headers = mergeRequestHeaders(part)
  let res: Response
  try {
    res = await fetch(url, {
      method,
      headers,
      body: part.body,
    })
  } catch (e) {
    throw new Error(describeFetchError(e, `Cribl API ${method} ${path}`))
  }
  const text = await res.text()
  let jsonValue: unknown | null = null
  const ct = res.headers.get('content-type') ?? ''
  if (ct.includes('application/json') && text.length > 0) {
    try {
      jsonValue = JSON.parse(text) as unknown
    } catch {
      jsonValue = null
    }
  }
  return { status: res.status, ok: res.ok, text, jsonValue }
}
