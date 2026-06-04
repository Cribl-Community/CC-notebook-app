import type { LookupService } from '@ports/LookupService'
import { lineSkipsMagicScan } from '@/domain/criblCellMagicSource'
import {
  buildExportDataframeToLookupBundleCode,
  buildLookupLoadDataframeCode,
  encodeUtf8ForPythonBase64,
  extractLookupExportFromOutputs,
  filterPyodidePackageChatter,
  parseCriblSearchLookupMagic,
  type CriblDeleteSearchLookupMagicOk,
  type CriblLoadSearchLookupMagicOk,
  type CriblSaveSearchLookupMagicOk,
} from '@features/cribl-search'
import { shouldSuppressJinjaPreExecuteIOPub } from '@features/notebook/jinjaInKernel'
import type { CellExecutionContext, CellExecutor, CellRunOutcome } from './cellExecutor'

export interface CriblSearchLookupExecutorDeps {
  parseCriblSearchLookupMagic: typeof parseCriblSearchLookupMagic
  buildExportDataframeToLookupBundleCode: typeof buildExportDataframeToLookupBundleCode
  buildLookupLoadDataframeCode: typeof buildLookupLoadDataframeCode
  encodeUtf8ForPythonBase64: typeof encodeUtf8ForPythonBase64
  extractLookupExportFromOutputs: typeof extractLookupExportFromOutputs
  filterPyodidePackageChatter: typeof filterPyodidePackageChatter
  lookupService: LookupService
  criblApiBase: string
  describeFetchError: (err: unknown, operation?: string) => string
}

const LOCAL_DEFAULTS = {
  parseCriblSearchLookupMagic,
  buildExportDataframeToLookupBundleCode,
  buildLookupLoadDataframeCode,
  encodeUtf8ForPythonBase64,
  extractLookupExportFromOutputs,
  filterPyodidePackageChatter,
} as const

export function looksLikeCriblSearchLookupMagic(source: string): boolean {
  for (const line of source.split(/\r?\n/)) {
    if (lineSkipsMagicScan(line)) continue
    const t = line.trim()
    return t.startsWith('%%cribl_save_search_lookup') ||
      t.startsWith('%%cribl_load_search_lookup') ||
      t.startsWith('%%cribl_delete_search_lookup')
  }
  return false
}

export function createCriblSearchLookupExecutor(
  required: Pick<CriblSearchLookupExecutorDeps, 'lookupService' | 'criblApiBase' | 'describeFetchError'> &
    Partial<Omit<CriblSearchLookupExecutorDeps, 'lookupService' | 'criblApiBase' | 'describeFetchError'>>,
): CellExecutor {
  const deps: CriblSearchLookupExecutorDeps = {
    ...LOCAL_DEFAULTS,
    ...required,
  }
  return {
    name: 'cribl-search-lookup',
    matches: looksLikeCriblSearchLookupMagic,
    execute: (ctx) => executeCriblSearchLookupCell(ctx, deps),
  }
}

async function executeCriblSearchLookupCell(
  ctx: CellExecutionContext,
  deps: CriblSearchLookupExecutorDeps,
): Promise<CellRunOutcome> {
  const { cellId: id, source, emitIOPub, dispatchNotebook } = ctx
  const magic = deps.parseCriblSearchLookupMagic(source)
  if (magic.kind === 'error') {
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${magic.message}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
  if (magic.kind === 'none') {
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: 'Unrecognized lookup magic cell.\n' })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  const apiBase = deps.criblApiBase.trim()
  if (!apiBase) {
    emitIOPub({
      msg_type: 'stream',
      name: 'stderr',
      text:
        'No CRIBL_API_URL: lookup magics are only available when the app runs inside the Cribl platform with a real API base.\n',
    })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  try {
    if (magic.kind === 'save') {
      return await runSave(ctx, deps, magic.value)
    }
    if (magic.kind === 'load') {
      return await runLoad(ctx, deps, magic.value)
    }
    return await runDelete(ctx, deps, magic.value)
  } catch (e) {
    const errMsg = deps.describeFetchError(e, 'Cribl lookup request')
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${errMsg}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
}

async function runSave(
  ctx: CellExecutionContext,
  deps: CriblSearchLookupExecutorDeps,
  value: CriblSaveSearchLookupMagicOk,
): Promise<CellRunOutcome> {
  const { kernel, cellId: id, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
  const exportCode = deps.buildExportDataframeToLookupBundleCode(value.varName)
  const exportResult = await kernel.execute(
    exportCode,
    (msg) => {
      if (msg.msg_type === 'status' || msg.msg_type === 'clear_output') return
      if (shouldSuppressJinjaPreExecuteIOPub(msg)) return
      if (msg.msg_type === 'stream') {
        const t = deps.filterPyodidePackageChatter(msg.text)
        if (t.length === 0) return
        emitIOPub({ ...msg, text: t })
        return
      }
      emitIOPub(msg)
    },
    count,
  )
  if (isStale()) return 'stale'

  const err = exportResult.outputs.find((o) => o.output_type === 'error')
  if (err && err.output_type === 'error') {
    emitIOPub({
      msg_type: 'stream',
      name: 'stderr',
      text: [err.ename, err.evalue, ...err.traceback].join('\n').trim() + '\n',
    })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  const extracted = deps.extractLookupExportFromOutputs(exportResult.outputs)
  if (!extracted) {
    emitIOPub({
      msg_type: 'stream',
      name: 'stderr',
      text: 'Could not read the DataFrame export result from the kernel.\n',
    })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  await deps.lookupService.saveLookupFromCsv({
    group: value.group,
    lookupId: value.lookupId,
    csvUtf8: extracted.csvUtf8,
    replace: value.replace,
    mode: value.mode,
  })
  if (isStale()) return 'stale'

  emitIOPub({
    msg_type: 'stream',
    name: 'stdout',
    text: `Saved lookup ${JSON.stringify(value.lookupId)} (${extracted.rows} rows, ${extracted.csvUtf8.length} bytes UTF-8 CSV).\n`,
  })
  dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
  return 'ok'
}

async function runLoad(
  ctx: CellExecutionContext,
  deps: CriblSearchLookupExecutorDeps,
  value: CriblLoadSearchLookupMagicOk,
): Promise<CellRunOutcome> {
  const { kernel, cellId: id, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
  const csvText = await deps.lookupService.downloadLookupCsv({
    group: value.group,
    lookupId: value.lookupId,
  })
  if (isStale()) return 'stale'

  const b64 = deps.encodeUtf8ForPythonBase64(csvText)
  const code = deps.buildLookupLoadDataframeCode(value.varName, b64)
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

async function runDelete(
  ctx: CellExecutionContext,
  deps: CriblSearchLookupExecutorDeps,
  value: CriblDeleteSearchLookupMagicOk,
): Promise<CellRunOutcome> {
  const { cellId: id, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
  await deps.lookupService.deleteLookup({
    group: value.group,
    lookupId: value.lookupId,
  })
  if (isStale()) return 'stale'
  emitIOPub({
    msg_type: 'stream',
    name: 'stdout',
    text: `Deleted lookup ${JSON.stringify(value.lookupId)} (or it was already absent).\n`,
  })
  dispatchNotebook({ type: 'FINISH_CELL', id, execution_count: count })
  return 'ok'
}
