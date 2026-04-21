import { useState } from 'react'
import type {
  OutputRecord,
  StreamOutput,
  ExecuteResultOutput,
  DisplayDataOutput,
  ErrorOutput,
} from '../pyodide/types'
import { MimeBundleView } from './MimeBundleView'
import { stripAnsi, extractCellLineRefs } from './ansiUtils'
import { suggestErrorFix } from '../cribl/riptideCode'
import { getCriblApiBase } from '../cribl/kvstore'

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

function ErrorOutputView({ output, cellSource }: { output: ErrorOutput; cellSource?: string }) {
  const [fixState, setFixState] = useState<'idle' | 'loading' | 'shown' | 'dismissed'>('idle')
  const [fixText, setFixText] = useState('')
  const [fixError, setFixError] = useState('')
  const cleanedTraceback = output.traceback.map((line) => stripAnsi(line))
  const refs = extractCellLineRefs(cleanedTraceback)
  const snippet = cellSource ? buildSourceSnippet(cellSource, refs) : []
  const canSuggestFix = Boolean(cellSource && getCriblApiBase())

  const handleSuggestFix = async () => {
    if (!cellSource || fixState === 'loading') return
    setFixError('')
    setFixState('loading')
    try {
      const suggested = await suggestErrorFix(cellSource, output.ename, output.evalue, cleanedTraceback)
      setFixText(suggested)
      setFixState('shown')
    } catch (e) {
      setFixError(e instanceof Error ? e.message : 'Unable to fetch AI fix suggestion.')
      setFixState('idle')
    }
  }

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
              <div className="nb-output-error-fix-body">{fixText}</div>
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

export function CellOutput({ output, cellSource }: { output: OutputRecord; cellSource?: string }) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  if (output.output_type === 'display_data') return <DisplayDataView output={output} />
  return <ErrorOutputView output={output} cellSource={cellSource} />
}
