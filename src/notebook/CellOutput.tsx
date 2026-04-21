import type {
  OutputRecord,
  StreamOutput,
  ExecuteResultOutput,
  DisplayDataOutput,
  ErrorOutput,
} from '../pyodide/types'
import { MimeBundleView } from './MimeBundleView'
import { stripAnsi, extractCellLineRefs } from './ansiUtils'

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
  const cleanedTraceback = output.traceback.map((line) => stripAnsi(line))
  const refs = extractCellLineRefs(cleanedTraceback)
  const snippet = cellSource ? buildSourceSnippet(cellSource, refs) : []

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
    </div>
  )
}

export function CellOutput({ output, cellSource }: { output: OutputRecord; cellSource?: string }) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  if (output.output_type === 'display_data') return <DisplayDataView output={output} />
  return <ErrorOutputView output={output} cellSource={cellSource} />
}
