/**
 * Public example datasets for bundled notebooks (Search `externaldata` / HTTP providers).
 * @see https://github.com/michaelhyatt/notebook-app-example-data
 */
export const EXAMPLE_DATA_REPO = 'michaelhyatt/notebook-app-example-data'

export const EXAMPLE_DATA_BRANCH = 'main'

export const EXAMPLE_DATA_BASE = `https://raw.githubusercontent.com/${EXAMPLE_DATA_REPO}/${EXAMPLE_DATA_BRANCH}`

export const exampleDataRawUrl = (...segments: string[]): string =>
  `${EXAMPLE_DATA_BASE}/${segments.map((s) => s.replace(/^\/+/, '')).join('/')}`

export const EXAMPLE_DATA_PATHS = {
  dailyMinTemperatures: 'anomaly-detection/daily-min-temperatures.csv',
  malwareBazaarTiLookup: 'malware-hunt/malwarebazaar_ti_lookup.csv',
  malwareBazaarRecentSample: 'malware-hunt/malwarebazaar_recent_sample.csv',
  malwareHuntPeImports: 'malware-hunt/pe_imports_hunt.csv',
} as const

export const EXAMPLE_DATA_URLS = {
  dailyMinTemperatures: exampleDataRawUrl(EXAMPLE_DATA_PATHS.dailyMinTemperatures),
  malwareBazaarTiLookup: exampleDataRawUrl(EXAMPLE_DATA_PATHS.malwareBazaarTiLookup),
  malwareBazaarRecentSample: exampleDataRawUrl(EXAMPLE_DATA_PATHS.malwareBazaarRecentSample),
  malwareHuntPeImports: exampleDataRawUrl(EXAMPLE_DATA_PATHS.malwareHuntPeImports),
} as const

/** All registered raw GitHub URLs (for contract tests and error hints). */
export const ALL_EXAMPLE_DATA_URLS: readonly string[] = Object.values(EXAMPLE_DATA_URLS)

/** Matches `raw.githubusercontent.com/.../notebook-app-example-data/main/<path>`. */
export const EXAMPLE_DATA_RAW_URL_PATTERN =
  /https:\/\/raw\.githubusercontent\.com\/michaelhyatt\/notebook-app-example-data\/main\/[a-zA-Z0-9_./-]+/g
