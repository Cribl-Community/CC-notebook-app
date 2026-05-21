import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  DisplayDataOutput,
  ErrorOutput,
  ExecuteResultOutput,
  OutputRecord,
  StreamOutput,
} from '@/domain/kernel'
import { MimeBundleView } from '@features/notebook/ui/MimeBundleView'
import { stripAnsi, extractCellLineRefs } from '@features/notebook/ui/ansiUtils'
import { useAiCodeService } from '@app/providers'

type SourceSnippetLine = {
  lineNumber: number
  text: string
  highlighted: boolean
}

function buildSourceSnippet(cellSource: string, refs: number[]): SourceSnippetLine[] {
  const srcLines = cellSource.replace(/\r\n/g, '\n').split('\n')
  const highlighted = new Set(refs)
  const include = new Set<number>()
  for (const line of refs) {
    include.add(line - 1)
    include.add(line)
    include.add(line + 1)
  }
  const picked = Array.from(include.values())
    .filter((line) => line >= 1 && line <= srcLines.length)
    .sort((a, b) => a - b)
    .slice(0, 5)
  return picked.map((lineNumber) => ({
    lineNumber,
    text: srcLines[lineNumber - 1] ?? '',
    highlighted: highlighted.has(lineNumber),
  }))
}

type FixSegment = { type: 'text'; text: string } | { type: 'code'; lang: string; code: string }

/** Split AI fix text into prose and fenced ```…``` code blocks (Markdown-style). */
function parseFixSuggestion(raw: string): FixSegment[] {
  const parts: FixSegment[] = []
  const s = raw.replace(/\r\n/g, '\n')
  let i = 0
  while (i < s.length) {
    const fence = s.indexOf('```', i)
    if (fence === -1) {
      const rest = s.slice(i)
      if (rest.length > 0) parts.push({ type: 'text', text: rest })
      break
    }
    if (fence > i) parts.push({ type: 'text', text: s.slice(i, fence) })
    const cursor = fence + 3
    const nl = s.indexOf('\n', cursor)
    if (nl === -1) {
      parts.push({ type: 'text', text: s.slice(fence) })
      break
    }
    const lang = s.slice(cursor, nl).trim()
    const contentStart = nl + 1
    const close = s.indexOf('```', contentStart)
    if (close === -1) {
      parts.push({ type: 'code', lang: lang || 'code', code: s.slice(contentStart).trimEnd() })
      break
    }
    parts.push({ type: 'code', lang: lang || 'code', code: s.slice(contentStart, close).trimEnd() })
    i = close + 3
    while (s[i] === '\n' || s[i] === '\r') i++
  }
  return parts
}

function StreamOutputView({ output }: { output: StreamOutput }) {
  const stderr = output.name === 'stderr'
  return (
    <pre className={`nb-output-pre${stderr ? ' nb-output-stream--stderr' : ''}`}>{output.text}</pre>
  )
}

function ExecuteResultView({ output }: { output: ExecuteResultOutput }) {
  return <MimeBundleView data={output.data} metadata={output.metadata} />
}

function DisplayDataView({ output }: { output: DisplayDataOutput }) {
  return <MimeBundleView data={output.data} metadata={output.metadata} />
}

function ErrorOutputView({
  output,
  cellSource,
  onReplaceCellSource,
}: {
  output: ErrorOutput
  cellSource?: string
  onReplaceCellSource?: (source: string) => void
}) {
  const [fixState, setFixState] = useState<'idle' | 'loading' | 'shown' | 'dismissed'>('idle')
  const [fixText, setFixText] = useState('')
  const [fixError, setFixError] = useState('')
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)
  const aiCode = useAiCodeService()
  const cleanedTraceback = output.traceback.map((line) => stripAnsi(line))
  const refs = extractCellLineRefs(cleanedTraceback)
  const snippet = cellSource ? buildSourceSnippet(cellSource, refs) : []
  const canSuggestFix = Boolean(cellSource && aiCode.isAvailable())

  const handleSuggestFix = async () => {
    if (!cellSource || fixState === 'loading') return
    setFixError('')
    setFixState('loading')
    try {
      const suggested = await aiCode.suggestErrorFix(
        cellSource,
        output.ename,
        output.evalue,
        cleanedTraceback,
      )
      setFixText(suggested)
      setFixState('shown')
    } catch (e) {
      setFixError(e instanceof Error ? e.message : 'Unable to fetch AI fix suggestion.')
      setFixState('idle')
    }
  }

  const fixSegments = useMemo(() => parseFixSuggestion(fixText), [fixText])
  const showFixRawFallback = useMemo(() => {
    if (!fixText.trim()) return false
    return !fixSegments.some((p) =>
      p.type === 'text' ? p.text.trim().length > 0 : p.code.trim().length > 0,
    )
  }, [fixText, fixSegments])

  const handleCopyCode = useCallback(async (key: string, code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedKey(key)
      if (copyTimerRef.current) globalThis.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = globalThis.setTimeout(() => setCopiedKey(null), 1500)
    } catch {
      /* ignore clipboard failures */
    }
  }, [])

  useEffect(
    () => () => {
      if (copyTimerRef.current) globalThis.clearTimeout(copyTimerRef.current)
    },
    [],
  )

  return (
    <div className="nb-output-error">
      <div className="nb-output-error-header">
        {output.ename}: {output.evalue}
      </div>
      {snippet.length > 0 && (
        <div className="nb-output-error-source">
          <div className="nb-output-error-source-label">Referenced code</div>
          <pre className="nb-output-pre nb-output-error-source-snippet">
            {snippet.map((line) => (
              <div
                key={line.lineNumber}
                className={line.highlighted ? 'nb-output-error-source-line--highlighted' : undefined}
              >
                {(line.highlighted ? '→' : ' ') + String(line.lineNumber).padStart(3, ' ')} | {line.text}
              </div>
            ))}
          </pre>
        </div>
      )}
      <pre className="nb-output-pre nb-output-traceback">
        {cleanedTraceback.join('\n')}
      </pre>
      {canSuggestFix && (
        <div className="nb-output-error-fix-footer">
          {fixState === 'idle' && (
            <button type="button" className="nb-btn nb-btn-ai-fix" onClick={handleSuggestFix}>
              ✦ Suggest Fix
            </button>
          )}
          {fixState === 'loading' && (
            <button type="button" className="nb-btn nb-btn-ai-fix" disabled>
              Generating…
            </button>
          )}
          {fixState === 'shown' && (
            <div className="nb-output-error-fix">
              <div className="nb-output-error-fix-title">
                AI suggestion
                <button
                  type="button"
                  className="nb-output-error-fix-dismiss"
                  onClick={() => setFixState('dismissed')}
                  title="Hide suggestion"
                >
                  ✕
                </button>
              </div>
              <div className="nb-output-error-fix-body">
                {fixSegments.map((part, idx) => {
                  if (part.type === 'text') {
                    if (part.text.trim().length === 0) return null
                    return (
                      <div key={`t-${idx}`} className="nb-output-error-fix-text">
                        {part.text}
                      </div>
                    )
                  }
                  if (part.code.trim().length === 0) return null
                  return (
                    <div key={`c-${idx}`} className="nb-output-error-fix-code">
                      <div className="nb-output-error-fix-code-toolbar">
                        <span className="nb-output-error-fix-code-lang">{part.lang}</span>
                        <div className="nb-output-error-fix-code-actions">
                          <button
                            type="button"
                            className="nb-btn nb-output-error-fix-code-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              void handleCopyCode(`c-${idx}`, part.code)
                            }}
                            aria-label="Copy suggested code"
                          >
                            {copiedKey === `c-${idx}` ? 'Copied' : 'Copy'}
                          </button>
                          {onReplaceCellSource && (
                            <button
                              type="button"
                              className="nb-btn nb-output-error-fix-code-btn nb-output-error-fix-code-btn--primary"
                              onClick={(e) => {
                                e.stopPropagation()
                                onReplaceCellSource(part.code)
                              }}
                              aria-label="Replace cell with this suggested code"
                            >
                              Replace cell
                            </button>
                          )}
                        </div>
                      </div>
                      <pre className="nb-output-pre nb-output-error-fix-code-pre">
                        <code>{part.code}</code>
                      </pre>
                    </div>
                  )
                })}
                {showFixRawFallback && (
                  <div className="nb-output-error-fix-text nb-output-error-fix-text--raw">{fixText}</div>
                )}
              </div>
            </div>
          )}
          {fixState === 'dismissed' && (
            <button
              type="button"
              className="nb-btn nb-btn-ai-fix-link"
              onClick={() => setFixState('shown')}
            >
              Show suggestion
            </button>
          )}
          {fixError && <div className="nb-output-error-fix-error">{fixError}</div>}
        </div>
      )}
    </div>
  )
}

export function CellOutput({
  output,
  cellSource,
  onReplaceCellSource,
}: {
  output: OutputRecord
  cellSource?: string
  onReplaceCellSource?: (source: string) => void
}) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  if (output.output_type === 'display_data') return <DisplayDataView output={output} />
  return <ErrorOutputView output={output} cellSource={cellSource} onReplaceCellSource={onReplaceCellSource} />
}
