import type { CellOutput as CellOutputType, StreamOutput, ExecuteResult, ErrorOutput } from '../pyodide/types'

function StreamOutputView({ output }: { output: StreamOutput }) {
  const color = output.name === 'stderr' ? '#f87171' : '#e2e8f0'
  return (
    <pre className="nb-output-pre" style={{ color }}>
      {output.text}
    </pre>
  )
}

function ExecuteResultView({ output }: { output: ExecuteResult }) {
  return (
    <pre className="nb-output-pre" style={{ color: '#e2e8f0' }}>
      {output.data}
    </pre>
  )
}

function ErrorOutputView({ output }: { output: ErrorOutput }) {
  return (
    <div className="nb-output-error">
      <div className="nb-output-error-header">
        {output.ename}: {output.evalue}
      </div>
      <pre className="nb-output-pre nb-output-traceback">
        {output.traceback.join('\n')}
      </pre>
    </div>
  )
}

export function CellOutput({ output }: { output: CellOutputType }) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  return <ErrorOutputView output={output} />
}
