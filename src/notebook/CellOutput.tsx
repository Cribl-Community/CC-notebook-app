import type { CellOutput as CellOutputType, StreamOutput, ExecuteResult, ErrorOutput } from '../pyodide/types'

function StreamOutputView({ output }: { output: StreamOutput }) {
  const stderr = output.name === 'stderr'
  return (
    <pre className={`nb-output-pre${stderr ? ' nb-output-stream--stderr' : ''}`}>{output.text}</pre>
  )
}

function ExecuteResultView({ output }: { output: ExecuteResult }) {
  return <pre className="nb-output-pre">{output.data}</pre>
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
