import { useReducer, useRef, useCallback, useEffect, useState } from 'react'
import { PyodideKernel } from '../pyodide/PyodideKernel'
import { notebookReducer, initialState } from './notebookReducer'
import type { CellId, NotebookState } from './types'
import { Toolbar } from './Toolbar'
import { CellList } from './CellList'

export function NotebookPage() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return (localStorage.getItem('nb-theme') as 'dark' | 'light') ?? 'dark'
    } catch {
      return 'dark'
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('nb-theme', theme)
    } catch {
      // localStorage unavailable in sandboxed iframe — theme resets on reload
    }
  }, [theme])

  const [state, dispatch] = useReducer(notebookReducer, initialState)
  const kernelRef = useRef<PyodideKernel | null>(null)
  const runQueueRef = useRef<Promise<void>>(Promise.resolve())
  const execCounterRef = useRef(0)
  // Incremented on each restart so stale queue callbacks can detect they're obsolete
  const genRef = useRef(0)

  // Keep a ref to state so queue callbacks always read fresh cell sources
  const stateRef = useRef<NotebookState>(state)
  useEffect(() => {
    stateRef.current = state
  })

  const initKernel = useCallback(() => {
    const myGen = ++genRef.current
    dispatch({ type: 'SET_KERNEL_STATUS', status: 'loading' })
    const kernel = new PyodideKernel()
    kernelRef.current = kernel
    kernel.ready
      .then(() => {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'ready' })
      })
      .catch(() => {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'error' })
      })
  }, [])

  useEffect(() => {
    initKernel()
    return () => {
      kernelRef.current?.dispose()
    }
  }, [initKernel])

  const runCell = useCallback((id: CellId) => {
    const kernel = kernelRef.current
    if (!kernel) return

    // Capture source and generation at click time, before queuing
    const cell = stateRef.current.cells.find((c) => c.id === id)
    if (!cell) return
    const source = cell.source
    const myGen = genRef.current

    runQueueRef.current = runQueueRef.current.then(async () => {
      // Bail if kernel was restarted while this task was queued
      if (genRef.current !== myGen) return

      dispatch({ type: 'SET_RUNNING', id })

      try {
        await kernel.ready
        if (genRef.current !== myGen) return

        dispatch({ type: 'SET_KERNEL_STATUS', status: 'busy' })
        const count = ++execCounterRef.current

        const result = await kernel.execute(source, (name, text) => {
          if (genRef.current === myGen) {
            dispatch({ type: 'APPEND_OUTPUT', id, output: { output_type: 'stream', name, text } })
          }
        })

        if (genRef.current !== myGen) return

        // Stream outputs already dispatched via onStream; append result/error outputs now
        for (const output of result.outputs) {
          if (output.output_type !== 'stream') {
            dispatch({ type: 'APPEND_OUTPUT', id, output })
          }
        }

        const hasError = result.outputs.some((o) => o.output_type === 'error')
        if (hasError) {
          dispatch({ type: 'ERROR_CELL', id })
        } else {
          dispatch({ type: 'FINISH_CELL', id, execution_count: count })
        }
      } catch {
        if (genRef.current === myGen) dispatch({ type: 'ERROR_CELL', id })
      } finally {
        if (genRef.current === myGen) dispatch({ type: 'SET_KERNEL_STATUS', status: 'ready' })
      }
    })
  }, [])

  const runAll = useCallback(() => {
    stateRef.current.cells
      .filter((c) => c.cell_type === 'code')
      .forEach((cell) => runCell(cell.id))
  }, [runCell])

  const restartKernel = useCallback(() => {
    kernelRef.current?.dispose()
    kernelRef.current = null
    runQueueRef.current = Promise.resolve()
    execCounterRef.current = 0
    dispatch({ type: 'RESTART' })
    initKernel()
  }, [initKernel])

  return (
    <div className="nb-page">
      <Toolbar
        kernelStatus={state.kernelStatus}
        onAddCodeCell={() => dispatch({ type: 'ADD_CELL', cellType: 'code' })}
        onAddMarkdownCell={() => dispatch({ type: 'ADD_CELL', cellType: 'markdown' })}
        onRunAll={runAll}
        onRestart={restartKernel}
        theme={theme}
        onThemeChange={setTheme}
      />
      {state.kernelStatus === 'loading' && (
        <div className="nb-loading">Loading Python kernel…</div>
      )}
      {state.kernelStatus === 'error' && (
        <div className="nb-loading nb-loading--error">
          Kernel failed to load. Check console for details.
        </div>
      )}
      <div className="nb-scroll">
        <CellList
          cells={state.cells}
          selectedId={state.selectedId}
          dispatch={dispatch}
          onRun={runCell}
        />
      </div>
    </div>
  )
}
