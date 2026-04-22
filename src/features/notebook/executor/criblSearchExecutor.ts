import { translateEnglishToKql } from '@platform/cribl/aiTranslate'
import { getCriblApiBase } from '@platform/cribl/kvstore'
import { DEFAULT_CRIBL_SEARCH_MAX_ROWS, runCriblSearchJob } from '@platform/cribl/searchJobs'
import {
  buildCriblSearchDataframeCode,
  encodeRowsJsonForPythonBase64,
  parseCriblSearchMagic,
} from '@features/cribl-search/criblSearchMagic'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import {
  criblSearchIOPub,
  formatCriblSearchError,
  formatCriblSearchJsonRows,
  formatCriblSearchRawRows,
} from '@features/cribl-search/criblSearchCellRunner'
import type { CellExecutionContext, CellExecutor, CellRunOutcome } from './cellExecutor'

export interface CriblSearchExecutorDeps {
  parseCriblSearchMagic: typeof parseCriblSearchMagic
  buildCriblSearchDataframeCode: typeof buildCriblSearchDataframeCode
  encodeRowsJsonForPythonBase64: typeof encodeRowsJsonForPythonBase64
  filterPyodidePackageChatter: typeof filterPyodidePackageChatter
  runCriblSearchJob: typeof runCriblSearchJob
  translateEnglishToKql: typeof translateEnglishToKql
  getCriblApiBase: typeof getCriblApiBase
  criblSearchMaxRows: number
}

export const DEFAULT_CRIBL_SEARCH_EXECUTOR_DEPS: CriblSearchExecutorDeps = {
  parseCriblSearchMagic,
  buildCriblSearchDataframeCode,
  encodeRowsJsonForPythonBase64,
  filterPyodidePackageChatter,
  runCriblSearchJob,
  translateEnglishToKql,
  getCriblApiBase,
  criblSearchMaxRows: DEFAULT_CRIBL_SEARCH_MAX_ROWS,
}

/**
 * Returns true for any source whose first non-empty line starts with the
 * `%cribl_search` magic. Cheap so it is safe to run on every cell without
 * invoking the full parser.
 */
export function looksLikeCriblSearchMagic(source: string): boolean {
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    return trimmed.startsWith('%cribl_search')
  }
  return false
}

/**
 * Creates the Cribl Search cell executor. Dependencies are injected so
 * tests can stub the search backend, AI translate, and Pyodide bridge
 * without touching the global network.
 */
export function createCriblSearchExecutor(
  overrides: Partial<CriblSearchExecutorDeps> = {},
): CellExecutor {
  const deps: CriblSearchExecutorDeps = { ...DEFAULT_CRIBL_SEARCH_EXECUTOR_DEPS, ...overrides }
  return {
    name: 'cribl-search',
    matches: looksLikeCriblSearchMagic,
    execute: (ctx) => executeCriblSearchCell(ctx, deps),
  }
}

export const criblSearchExecutor: CellExecutor = createCriblSearchExecutor()

async function executeCriblSearchCell(
  ctx: CellExecutionContext,
  deps: CriblSearchExecutorDeps,
): Promise<CellRunOutcome> {
  const { kernel, cellId: id, source, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
  const magic = deps.parseCriblSearchMagic(source)
  if (magic.kind === 'error') {
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${magic.message}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  if (magic.kind !== 'cribl_search') {
    // Shouldn't happen: matches() returned true but parse said it's not a magic.
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: 'Unrecognized cribl_search cell.\n' })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  const { varName, query, preview, response, earliest, latest, limit, lang, dataset } = magic.value
  const displayId = `cribl-search-${id}`
  let generatedKqlForReport: string | undefined
  try {
    emitIOPub(
      criblSearchIOPub({ kind: 'running', progress: 0.06, label: 'Starting search…' }, displayId, false),
    )

    let searchQuery = query
    if (lang === 'english') {
      if (!deps.getCriblApiBase()) {
        emitIOPub(
          criblSearchIOPub(
            {
              kind: 'running',
              progress: 0.14,
              label: 'Local dev mode: skipping AI translation (using query as-is)…',
            },
            displayId,
            true,
          ),
        )
      } else {
        emitIOPub(
          criblSearchIOPub(
            { kind: 'running', progress: 0.14, label: 'Translating query to KQL…' },
            displayId,
            true,
          ),
        )
        searchQuery = await deps.translateEnglishToKql(query, { datasetHint: dataset })
        generatedKqlForReport = searchQuery
        emitIOPub({
          msg_type: 'stream',
          name: 'stdout',
          text: `Generated KQL:\n${searchQuery}\n`,
        })
      }
    }

    const { rows, columns, totalRecords } = await deps.runCriblSearchJob({
      query: searchQuery,
      queryMode: 'verbatim',
      maxRows: limit,
      earliest,
      latest,
      onProgress: (ev) => {
        emitIOPub(
          criblSearchIOPub(
            { kind: 'running', progress: ev.fraction, label: ev.label },
            displayId,
            true,
          ),
        )
      },
    })
    if (isStale()) return 'stale'

    emitIOPub(
      criblSearchIOPub(
        {
          kind: 'completed',
          columns,
          rows: preview && response === 'dataframe' ? rows.slice(0, deps.criblSearchMaxRows) : [],
          recordsReturned: rows.length,
          totalRecords,
          dataframeVar: varName,
          showTable: preview && response === 'dataframe',
        },
        displayId,
        true,
      ),
    )
    if (response === 'dataframe') {
      const b64 = deps.encodeRowsJsonForPythonBase64(rows)
      /** Rich table already shows rows; never add `print(df.head())` (avoids duplicate text). */
      const code = deps.buildCriblSearchDataframeCode(varName, b64, false)
      let sawError = false
      await kernel.execute(
        code,
        (msg) => {
          if (msg.msg_type === 'stream') {
            const filtered = deps.filterPyodidePackageChatter(msg.text)
            if (filtered.length === 0) return
            emitIOPub({ ...msg, text: filtered })
            return
          }
          if (msg.msg_type === 'error') sawError = true
          emitIOPub(msg)
        },
        count,
      )

      if (isStale()) return 'stale'

      if (sawError) {
        dispatchNotebook({ type: 'ERROR_CELL', id })
        return 'error'
      }
      dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
      return 'ok'
    }
    const text = response === 'json' ? formatCriblSearchJsonRows(rows) : formatCriblSearchRawRows(rows)
    emitIOPub({ msg_type: 'stream', name: 'stdout', text })
    dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
    return 'ok'
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    const pretty = formatCriblSearchError(errMsg, lang === 'english' ? generatedKqlForReport : undefined)
    if (!isStale()) {
      emitIOPub(criblSearchIOPub({ kind: 'failed', message: pretty }, displayId, true))
    }
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
}
