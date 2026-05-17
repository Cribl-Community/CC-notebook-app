import { CRIBL_SEARCH_MIME, type CriblSearchPayload } from '@/domain/criblSearchMime'
import type { IOPubMessage } from '@ports/KernelPort'

export function criblSearchPlainSummary(p: CriblSearchPayload): string {
  if (p.kind === 'running') return `Cribl Search: ${p.label}`
  if (p.kind === 'failed') return `Cribl Search failed: ${p.message}`
  if (p.translateOnly) return 'Cribl Search: KQL generated (search not run)'
  const total =
    p.totalRecords != null && p.totalRecords !== p.recordsReturned
      ? `${p.recordsReturned} records (${p.totalRecords} total)`
      : `${p.recordsReturned} records`
  return `Cribl Search: ${total}`
}

export function criblSearchIOPub(
  payload: CriblSearchPayload,
  display_id: string,
  update: boolean,
): IOPubMessage {
  const data = {
    'text/plain': criblSearchPlainSummary(payload),
    [CRIBL_SEARCH_MIME]: JSON.stringify(payload),
  }
  if (update) {
    return {
      msg_type: 'update_display_data',
      data,
      metadata: {},
      transient: { display_id },
    }
  }
  return {
    msg_type: 'display_data',
    data,
    metadata: {},
    transient: { display_id },
  }
}

export function formatCriblSearchError(raw: string, generatedQuery?: string): string {
  const msg = raw.trim()
  if (/Search job create failed \(400\)/i.test(msg) && /no viable alternative/i.test(msg)) {
    const parts = [
      'Generated KQL is invalid for Cribl Search (parser error).',
      'Try refining the English prompt, include `dataset=...` in the magic header, or run with `lang=kql`.',
    ]
    if (generatedQuery && generatedQuery.trim().length > 0) {
      parts.push(`Generated KQL:\n${generatedQuery}`)
    }
    return parts.join('\n\n')
  }
  if (/Search job failed/i.test(msg) && /404|not found|dataset.*not exist|unknown dataset/i.test(msg)) {
    const parts = [
      'Search could not load the dataset or CSV URL.',
      'On a hosted app, re-run the URL cell so PE/TI point at your pack (`{origin}{CRIBL_BASE_PATH}/data/malware-hunt/…`).',
      'If you use GitHub raw URLs, merge `public/data/malware-hunt/` to `main` on the remote first.',
    ]
    parts.push(msg)
    if (generatedQuery?.trim()) parts.push(`Query:\n${generatedQuery}`)
    return parts.join('\n\n')
  }
  if (/AI translation/i.test(msg) || /did not return a valid KQL/i.test(msg)) {
    const parts = ['Natural-language to KQL translation failed.']
    if (generatedQuery && generatedQuery.trim().length > 0) {
      parts.push(`Generated KQL candidate:\n${generatedQuery}`)
    }
    parts.push(msg)
    return parts.join('\n\n')
  }
  if (generatedQuery && generatedQuery.trim().length > 0) {
    return `${msg}\n\nGenerated KQL:\n${generatedQuery}`
  }
  return msg
}

export function formatCriblSearchJsonRows(rows: Record<string, unknown>[]): string {
  return `${JSON.stringify(rows, null, 2)}\n`
}

export function formatCriblSearchRawRows(rows: Record<string, unknown>[]): string {
  const lines = rows.map((row) => {
    const raw = row._raw
    if (typeof raw === 'string') return raw
    return JSON.stringify(row)
  })
  return `${lines.join('\n')}\n`
}
