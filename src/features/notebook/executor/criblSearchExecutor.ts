import { DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS } from '@/domain/search'
import type { SearchService } from '@ports/SearchService'
import { describeFetchError } from '@platform/cribl/fetchFailure'
import { lineSkipsMagicScan } from '@features/notebook/magicCellLines'
import { planCriblSearchDataframeHydration } from '@features/cribl-search/criblSearchDataframeHydration'
import {
  parseCriblSearchMagic,
  wantsCriblSearchJinjaTemplating,
} from '@features/cribl-search/criblSearchMagic'
import { runCriblSearchJinjaInKernel } from '@features/cribl-search/criblSearchJinjaRender'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import {
  criblSearchIOPub,
  formatCriblSearchError,
  formatCriblSearchJsonRows,
  formatCriblSearchRawRows,
} from '@features/cribl-search/criblSearchCellRunner'
import type { IOPubMessage } from '@/domain/kernel'
import type { SearchProgressEvent } from '@/domain/search'
import type { CellExecutionContext, CellExecutor, CellRunOutcome } from './cellExecutor'

export interface CriblSearchExecutorDeps {
  parseCriblSearchMagic: typeof parseCriblSearchMagic
  planCriblSearchDataframeHydration: typeof planCriblSearchDataframeHydration
  filterPyodidePackageChatter: typeof filterPyodidePackageChatter
  searchService: SearchService
  /** Same signal as {@link getCriblApiBase} / {@link EnvService.apiBase}: empty when not hosted in Cribl. */
  criblApiBase: string
  criblSearchMaxRows: number
  wantsCriblSearchJinjaTemplating: typeof wantsCriblSearchJinjaTemplating
  runCriblSearchJinjaInKernel: typeof runCriblSearchJinjaInKernel
}

const CRIBL_SEARCH_LOCAL_DEFAULTS = {
  parseCriblSearchMagic,
  planCriblSearchDataframeHydration,
  filterPyodidePackageChatter,
  criblSearchMaxRows: DEFAULT_CRIBL_SEARCH_TABLE_PREVIEW_MAX_ROWS,
  wantsCriblSearchJinjaTemplating,
  runCriblSearchJinjaInKernel,
} as const

export function createCriblSearchExecutor(
  required: Pick<CriblSearchExecutorDeps, 'searchService' | 'criblApiBase'> &
    Partial<Omit<CriblSearchExecutorDeps, 'searchService' | 'criblApiBase'>>,
): CellExecutor {
  const deps: CriblSearchExecutorDeps = {
    ...CRIBL_SEARCH_LOCAL_DEFAULTS,
    ...required,
  }
  return {
    name: 'cribl-search',
    matches: looksLikeCriblSearchMagic,
    execute: (ctx) => executeCriblSearchCell(ctx, deps),
  }
}

/**
 * Returns true when the first non-skipped line (non-empty, not a full-line `#` comment)
 * starts with `%%cribl_search`. Cheap so it is safe to run on every cell without invoking
 * the full parser.
 *
 * NOTE: two percent signs — this is a Jupyter-style cell magic, not an
 * IPython line magic. Using a single `%` here routes every search cell to
 * the Python executor, which then throws `SyntaxError: invalid syntax` on
 * the very first line.
 */
export function looksLikeCriblSearchMagic(source: string): boolean {
  for (const line of source.split(/\r?\n/)) {
    if (lineSkipsMagicScan(line)) continue
    return line.trim().startsWith('%%cribl_search')
  }
  return false
}

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

  const {
    varName,
    query,
    preview,
    response,
    earliest,
    latest,
    limit,
    timeoutSec,
    lang,
    dataset,
    template,
    translateOnly,
  } = magic.value
  const displayId = `cribl-search-${id}`
  let generatedKqlForReport: string | undefined
  /** Query text sent to Search (after Jinja); included in failure output. */
  let executedQuery = query
  const apiBase = deps.criblApiBase.trim()

  const reportSearchProgress = (ev: SearchProgressEvent, update: boolean): void => {
    emitIOPub(
      criblSearchIOPub({ kind: 'running', progress: ev.fraction, label: ev.label }, displayId, update),
    )
  }

  try {
    emitIOPub(
      criblSearchIOPub(
        {
          kind: 'running',
          progress: 0.06,
          label:
            lang === 'english' && translateOnly ? 'Starting translation…' : 'Starting search…',
        },
        displayId,
        false,
      ),
    )

    let searchQuery = query
    executedQuery = searchQuery
    if (deps.wantsCriblSearchJinjaTemplating(query, template)) {
      emitIOPub(
        criblSearchIOPub(
          { kind: 'running', progress: 0.1, label: 'Rendering Jinja template…' },
          displayId,
          true,
        ),
      )
      const jinja = await deps.runCriblSearchJinjaInKernel(kernel, query, {
        executionCount: 0,
        emitIOPub,
        filterPyodidePackageChatter: deps.filterPyodidePackageChatter,
      })
      if (jinja.ok) {
        searchQuery = jinja.text
        executedQuery = searchQuery
      } else {
        emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${jinja.errorMessage}\n` })
        dispatchNotebook({ type: 'ERROR_CELL', id })
        return 'error'
      }
    }
    if (isStale()) return 'stale'

    if (lang === 'english') {
      if (!apiBase) {
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
        generatedKqlForReport = searchQuery
        executedQuery = searchQuery
        emitIOPub({
          msg_type: 'stream',
          name: 'stdout',
          text: `Generated KQL:\n${searchQuery}\n`,
        })
      } else {
        emitIOPub(
          criblSearchIOPub(
            { kind: 'running', progress: 0.14, label: 'Translating query to KQL…' },
            displayId,
            true,
          ),
        )
        searchQuery = await deps.searchService.translateEnglishToKql(searchQuery, {
          datasetHint: dataset,
        })
        generatedKqlForReport = searchQuery
        executedQuery = searchQuery
        emitIOPub({
          msg_type: 'stream',
          name: 'stdout',
          text: `Generated KQL:\n${searchQuery}\n`,
        })
      }

      if (translateOnly) {
        emitIOPub(
          criblSearchIOPub(
            {
              kind: 'completed',
              columns: [],
              rows: [],
              recordsReturned: 0,
              totalRecords: null,
              dataframeVar: varName,
              showTable: false,
              translateOnly: true,
              generatedKql: searchQuery,
            },
            displayId,
            true,
          ),
        )
        dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
        return 'ok'
      }
    }

    const { rows, columns, totalRecords } = await deps.searchService.runSearch({
      query: searchQuery,
      maxRows: limit,
      earliest,
      latest,
      pollTimeoutMs: timeoutSec * 1000,
      onProgress: (ev) => reportSearchProgress(ev, true),
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
      const plan = deps.planCriblSearchDataframeHydration(varName, rows, totalRecords, false)
      const codeBlocks =
        plan.kind === 'single'
          ? [plan.code]
          : [plan.initCode, ...plan.chunkCodes, plan.footerCode]

      let sawError = false
      const onMsg = (msg: IOPubMessage) => {
        if (msg.msg_type === 'stream') {
          const filtered = deps.filterPyodidePackageChatter(msg.text)
          if (filtered.length === 0) return
          emitIOPub({ ...msg, text: filtered })
          return
        }
        if (msg.msg_type === 'error') sawError = true
        emitIOPub(msg)
      }

      for (const code of codeBlocks) {
        if (isStale() || sawError) break
        await kernel.execute(code, onMsg, count)
      }

      if (isStale()) return 'stale'

      if (sawError) {
        dispatchNotebook({ type: 'ERROR_CELL', id })
        return 'error'
      }
      dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
      return 'ok'
    }
    if (response === 'json') {
      const pretty = formatCriblSearchJsonRows(rows)
      emitIOPub({
        msg_type: 'display_data',
        data: {
          'application/json': pretty,
          'text/plain': pretty,
        },
        metadata: {},
      })
    } else {
      const text = formatCriblSearchRawRows(rows)
      emitIOPub({ msg_type: 'stream', name: 'stdout', text })
    }
    dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
    return 'ok'
  } catch (e) {
    const errMsg = describeFetchError(e, 'Cribl Search request')
    const pretty = formatCriblSearchError(
      errMsg,
      generatedKqlForReport ?? executedQuery,
    )
    emitIOPub(criblSearchIOPub({ kind: 'failed', message: pretty }, displayId, true))
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
}
