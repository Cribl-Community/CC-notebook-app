import type { SearchJobResult } from '@/domain/search'
import type { SearchRunOptions, SearchService } from '@ports/SearchService'
import { runCriblSearchJob } from '@platform/cribl/searchJobs'
import { translateEnglishToKql } from '@platform/cribl/aiTranslate'

function mapSearchResultToDomain(result: Awaited<ReturnType<typeof runCriblSearchJob>>): SearchJobResult {
  return {
    rows: result.rows,
    columns: result.columns,
    totalRecords: result.totalRecords,
  }
}

function normalizeQueryMode(
  mode: SearchRunOptions['queryMode'],
): 'verbatim' | 'normalized' {
  return mode === 'verbatim' ? 'verbatim' : 'normalized'
}

export const criblSearchService: SearchService = {
  async runSearch(opts) {
    const result = await runCriblSearchJob({
      query: opts.query,
      queryMode: normalizeQueryMode(opts.queryMode),
      maxRows: opts.maxRows,
      earliest: opts.earliest,
      latest: opts.latest,
      pollTimeoutMs: opts.pollTimeoutMs,
      onProgress: opts.onProgress,
    })
    return mapSearchResultToDomain(result)
  },
  translateEnglishToKql(englishQuery, options) {
    return translateEnglishToKql(englishQuery, options)
  },
}
