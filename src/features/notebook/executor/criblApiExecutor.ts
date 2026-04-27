import { callCriblApi, type CriblApiHttpResult } from '@platform/cribl/criblApiFetch'
import { getCriblApiBase } from '@platform/env/env'
import {
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
  encodeUtf8TextForPythonBase64,
  encodeValueJsonForPythonBase64,
  parseCriblApiMagic,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
} from '@features/cribl-api/criblApiMagic'
import { JINJA_RESULT_KEY_CRIBL_API, runNotebookJinjaInKernel } from '@features/notebook/jinjaInKernel'
import { filterPyodidePackageChatter } from '@features/cribl-search/criblSearchStreamFilter'
import type { CellExecutionContext, CellExecutor, CellRunOutcome } from './cellExecutor'

export function looksLikeCriblApiMagic(source: string): boolean {
  for (const line of source.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '') continue
    return trimmed.startsWith('%%cribl_api')
  }
  return false
}

export type CriblApiExecutorDeps = {
  parseCriblApiMagic: typeof parseCriblApiMagic
  getCriblApiBase: typeof getCriblApiBase
  runNotebookJinjaInKernel: typeof runNotebookJinjaInKernel
  filterPyodidePackageChatter: typeof filterPyodidePackageChatter
  callCriblApi: typeof callCriblApi
  parseCriblApiYamlToRequest: typeof parseCriblApiYamlToRequest
  wantsCriblApiJinjaTemplating: typeof wantsCriblApiJinjaTemplating
  encodeValueJsonForPythonBase64: typeof encodeValueJsonForPythonBase64
  encodeUtf8TextForPythonBase64: typeof encodeUtf8TextForPythonBase64
  buildCriblApiJsonValueAssignmentCode: typeof buildCriblApiJsonValueAssignmentCode
  buildCriblApiStringValueAssignmentCode: typeof buildCriblApiStringValueAssignmentCode
}

export const DEFAULT_CRIBL_API_EXECUTOR_DEPS: CriblApiExecutorDeps = {
  parseCriblApiMagic,
  getCriblApiBase,
  runNotebookJinjaInKernel,
  filterPyodidePackageChatter,
  callCriblApi,
  parseCriblApiYamlToRequest,
  wantsCriblApiJinjaTemplating,
  encodeValueJsonForPythonBase64,
  encodeUtf8TextForPythonBase64,
  buildCriblApiJsonValueAssignmentCode,
  buildCriblApiStringValueAssignmentCode,
}

export function createCriblApiExecutor(overrides: Partial<CriblApiExecutorDeps> = {}): CellExecutor {
  const deps: CriblApiExecutorDeps = { ...DEFAULT_CRIBL_API_EXECUTOR_DEPS, ...overrides }
  return {
    name: 'cribl-api',
    matches: looksLikeCriblApiMagic,
    execute: (ctx) => executeCriblApiCell(ctx, deps),
  }
}

export const criblApiExecutor: CellExecutor = createCriblApiExecutor()

function parseResponseJson(
  res: CriblApiHttpResult,
  responseMode: 'json' | 'raw' | 'text',
): { ok: true; value: unknown } | { ok: false; message: string } {
  if (responseMode !== 'json') {
    return { ok: true, value: res.text }
  }
  if (res.text.trim() === '') {
    return { ok: true, value: null }
  }
  if (res.jsonValue != null) {
    return { ok: true, value: res.jsonValue }
  }
  try {
    return { ok: true, value: JSON.parse(res.text) as unknown }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, message: `Response is not valid JSON (${msg}).` }
  }
}

async function executeCriblApiCell(
  ctx: CellExecutionContext,
  deps: CriblApiExecutorDeps,
): Promise<CellRunOutcome> {
  const { kernel, cellId: id, source, executionCount: count, emitIOPub, isStale, dispatchNotebook } = ctx
  const magic = deps.parseCriblApiMagic(source)
  if (magic.kind === 'error') {
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${magic.message}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
  if (magic.kind !== 'cribl_api') {
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: 'Unrecognized cribl_api cell.\n' })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
  const { method, path, varName, preview, response: responseMode, yamlBlock, template } = magic.value
  if (!deps.getCriblApiBase()) {
    emitIOPub({
      msg_type: 'stream',
      name: 'stderr',
      text:
        'No CRIBL_API_URL: %%cribl_api is only available when the app runs inside the Cribl platform with a real API base.\n',
    })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
  let yamlToParse = yamlBlock
  if (deps.wantsCriblApiJinjaTemplating(yamlBlock, template)) {
    emitIOPub({ msg_type: 'stream', name: 'stdout', text: 'Rendering Jinja template in YAML block…\n' })
    const jinja = await deps.runNotebookJinjaInKernel(kernel, yamlBlock, {
      resultKey: JINJA_RESULT_KEY_CRIBL_API,
      executionCount: 0,
      emitIOPub,
      filterPyodidePackageChatter: deps.filterPyodidePackageChatter,
    })
    if (!jinja.ok) {
      emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${jinja.errorMessage}\n` })
      dispatchNotebook({ type: 'ERROR_CELL', id })
      return 'error'
    }
    yamlToParse = jinja.text
  }
  if (isStale()) return 'stale'

  let part: { headers: Record<string, string>; body: string | undefined; bodyIsJson: boolean }
  try {
    part = deps.parseCriblApiYamlToRequest(yamlToParse)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${msg}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }

  try {
    const res = await deps.callCriblApi(method, path, part, deps.getCriblApiBase)
    if (isStale()) return 'stale'
    if (!res.ok) {
      emitIOPub({
        msg_type: 'stream',
        name: 'stderr',
        text: `HTTP ${res.status} ${res.text.slice(0, 2000)}${res.text.length > 2000 ? '…' : ''}\n`,
      })
      dispatchNotebook({ type: 'ERROR_CELL', id })
      return 'error'
    }
    if (isStale()) return 'stale'
    if (responseMode === 'json') {
      const rj = parseResponseJson(res, responseMode)
      if (!rj.ok) {
        emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${rj.message}\n` })
        dispatchNotebook({ type: 'ERROR_CELL', id })
        return 'error'
      }
      if (preview) {
        emitIOPub({ msg_type: 'stream', name: 'stdout', text: `HTTP ${res.status}\n${formatPreviewJson(rj.value)}\n` })
      }
      const b64 = deps.encodeValueJsonForPythonBase64(rj.value)
      const code = deps.buildCriblApiJsonValueAssignmentCode(varName, b64)
      return runKernelAssign(ctx, deps, count, code, isStale, emitIOPub, dispatchNotebook)
    }
    const b64s = deps.encodeUtf8TextForPythonBase64(res.text)
    if (preview) {
      const sample = res.text.length > 4000 ? `${res.text.slice(0, 4000)}…` : res.text
      emitIOPub({ msg_type: 'stream', name: 'stdout', text: `HTTP ${res.status} (${res.text.length} bytes)\n${sample}\n` })
    }
    const code = deps.buildCriblApiStringValueAssignmentCode(varName, b64s)
    return runKernelAssign(ctx, deps, count, code, isStale, emitIOPub, dispatchNotebook)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    emitIOPub({ msg_type: 'stream', name: 'stderr', text: `${msg}\n` })
    dispatchNotebook({ type: 'ERROR_CELL', id })
    return 'error'
  }
}

function formatPreviewJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

async function runKernelAssign(
  ctx: CellExecutionContext,
  deps: CriblApiExecutorDeps,
  count: number,
  code: string,
  isStale: () => boolean,
  emitIOPub: CellExecutionContext['emitIOPub'],
  dispatchNotebook: CellExecutionContext['dispatchNotebook'],
): Promise<CellRunOutcome> {
  const { cellId, kernel } = ctx
  if (isStale()) return 'stale'
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
    dispatchNotebook({ type: 'ERROR_CELL', id: cellId })
    return 'error'
  }
  dispatchNotebook({ type: 'FINISH_CELL', id: cellId, execution_count: count })
  return 'ok'
}