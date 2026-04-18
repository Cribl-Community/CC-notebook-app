import PyodideSmokeTest from './PyodideSmokeTest'

export default function App() {
  if (import.meta.env.DEV) return <PyodideSmokeTest />
  return (
    <div style={{ fontFamily: 'monospace', padding: 32, color: '#94a3b8' }}>
      Loading notebook…
    </div>
  )
}
