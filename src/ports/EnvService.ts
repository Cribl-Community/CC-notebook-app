/**
 * Port for runtime environment discovery. Encodes whether the app is running
 * inside Cribl (with a real API base and live KV store) or in local dev/tests
 * (where KV is mocked and Cribl-dependent features are gated off).
 */
export interface EnvService {
  /** Base URL for Cribl API calls, or empty string when running in mock mode. */
  apiBase: string
  /** True when `apiBase` is non-empty (i.e. running inside Cribl). */
  isCriblHosted: boolean
  /** True when the KV store is simulated (no `CRIBL_API_URL`). */
  isKvMock: boolean
  /**
   * Base URL prefix for static assets under `public/` (respects Vite `base` /
   * `CRIBL_BASE_PATH`). Trailing slash included.
   */
  staticAssetPrefix: string
}
