import type {
  OutputRecord,
  StreamOutput,
  ExecuteResultOutput,
  DisplayDataOutput,
  ErrorOutput,
} from '../pyodide/types'
import { MimeBundleView } from './MimeBundleView'

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

export function CellOutput({ output, cellSource }: { output: OutputRecord; cellSource?: string }) {
  if (output.output_type === 'stream') return <StreamOutputView output={output} />
  if (output.output_type === 'execute_result') return <ExecuteResultView output={output} />
  if (output.output_type === 'display_data') return <DisplayDataView output={output} />
  return <ErrorOutputView output={output} cellSource={cellSource} />
}
