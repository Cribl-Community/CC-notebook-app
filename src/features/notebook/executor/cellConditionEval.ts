import type { KernelPort } from '@ports/KernelPort'
import type { OutputRecord } from '@/domain/kernel'
import type { CellConditionOutcome } from '@features/notebook/model/types'
import { normalizeRunCondition } from '@features/notebook/codeCellFold'

const MARKER = '__NB_COND_JSON__:'

export type CellConditionEvalResult = {
  outcome: CellConditionOutcome
  /** Present when outcome is `error` (Python exception while evaluating). */
  detail?: string
  /** When true, the cell body should not run. */
  skipBody: boolean
}

function parseProbeOutputs(outputs: OutputRecord[]): CellConditionEvalResult | null {
  const chunks: string[] = []
  for (const o of outputs) {
    if (o.output_type === 'stream' && o.name === 'stdout') {
      chunks.push(o.text)
    }
  }
  const text = chunks.join('')
  const idx = text.lastIndexOf(MARKER)
  if (idx === -1) return null
  const jsonPart = text.slice(idx + MARKER.length).trim()
  try {
    const parsed = JSON.parse(jsonPart) as { outcome?: string; detail?: string }
    if (parsed.outcome === 'true') return { outcome: 'true', skipBody: false }
    if (parsed.outcome === 'false') return { outcome: 'false', skipBody: true }
    if (parsed.outcome === 'error')
      return { outcome: 'error', skipBody: true, detail: typeof parsed.detail === 'string' ? parsed.detail : '' }
  } catch {
    /* fall through */
  }
  return null
}

/** Builds Python that prints a single JSON line prefixed with {@link MARKER}. */
export function buildCellConditionProbeCode(expr: string): string {
  const payload = JSON.stringify(JSON.stringify(normalizeRunCondition(expr)))
  return `import ast, json as _json
_nb_s = ${payload}
_nb_expr = _json.loads(_nb_s)
if not isinstance(_nb_expr, str):
    _nb_expr = "True"
_nb_expr = (_nb_expr or "").strip() or "True"
try:
    _nb_tree = ast.parse(_nb_expr, mode="eval")
    _nb_val = bool(eval(compile(_nb_tree, "<run condition>", "eval")))
    _nb_payload = {"outcome": "true" if _nb_val else "false"}
except Exception as _nb_e:
    _nb_payload = {"outcome": "error", "detail": str(_nb_e)}
print("${MARKER}" + _json.dumps(_nb_payload))
`
}

/**
 * Evaluates the run-condition expression in the kernel without forwarding IOPub
 * to the notebook cell.
 */
export async function evaluateCellRunCondition(
  kernel: KernelPort,
  expr: string,
): Promise<CellConditionEvalResult> {
  const code = buildCellConditionProbeCode(expr)
  try {
    const { outputs } = await kernel.execute(code, undefined, 0)
    const parsed = parseProbeOutputs(outputs)
    if (parsed) return parsed
  } catch (e) {
    return {
      outcome: 'error',
      skipBody: true,
      detail: e instanceof Error ? e.message : String(e),
    }
  }
  return {
    outcome: 'error',
    skipBody: true,
    detail: 'Condition probe produced no marker output',
  }
}
