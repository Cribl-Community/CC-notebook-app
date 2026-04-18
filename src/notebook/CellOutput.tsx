import type {
  CellOutput as CellOutputType,
  StreamOutput,
  ExecuteResult,
  ErrorOutput,
  CriblSearchOutput,
} from '../pyodide/types'
import { CriblSearchOutputView } from './CriblSearchOutput'

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

function CriblSearchOutputWrap({ output }: { output: CriblSearchOutput }) {
  return <CriblSearchOutputView payload={output.payload} />
}

export function CellOutput({ output }: { output: CellOutputType }) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  if (output.output_type === 'cribl_search') return <CriblSearchOutputWrap output={output} />
  return <ErrorOutputView output={output} />
}
