import { useEffect, useRef, useState } from 'react'
import { runSimulation } from '../engine/simulate'
import type { Scenario, SimResult } from '../engine/types'

// Runs the Monte-Carlo simulation whenever the scenario settles. Prefers a Web
// Worker so heavy path counts never block typing; falls back to running inline
// if the worker can't start OR fails to load (e.g. a packaging/CSP issue in a
// desktop shell) — the app must never hang on "running…". Debounced so
// dragging a slider doesn't spawn a run per pixel; stale results are discarded
// by request id.
export function useSimulation(scenario: Scenario, debounceMs = 250) {
  const [result, setResult] = useState<SimResult | null>(null)
  const [running, setRunning] = useState(false)
  const [ms, setMs] = useState(0)
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const startedAt = useRef(0)
  const latest = useRef(scenario)
  latest.current = scenario

  // Create the worker once.
  useEffect(() => {
    try {
      const w = new Worker(new URL('../engine/sim.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<{ id: number; result?: SimResult; error?: string }>) => {
        if (e.data.id !== reqId.current) return // stale
        setRunning(false)
        setMs(performance.now() - startedAt.current)
        if (e.data.result) setResult(e.data.result)
      }
      // Worker script failed to load/execute: degrade to inline and recover.
      w.onerror = () => {
        w.terminate()
        workerRef.current = null
        const r = runSimulation(latest.current)
        setResult(r)
        setRunning(false)
        setMs(performance.now() - startedAt.current)
      }
      workerRef.current = w
    } catch {
      workerRef.current = null // will use the inline fallback
    }
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    const id = ++reqId.current
    setRunning(true)
    const handle = setTimeout(() => {
      startedAt.current = performance.now()
      const w = workerRef.current
      if (w) {
        w.postMessage({ id, kind: 'sim', scenario })
      } else {
        // Inline fallback: yield a tick so the spinner can paint.
        setTimeout(() => {
          if (id !== reqId.current) return
          const r = runSimulation(scenario)
          setResult(r)
          setRunning(false)
          setMs(performance.now() - startedAt.current)
        }, 0)
      }
    }, debounceMs)
    return () => clearTimeout(handle)
  }, [scenario, debounceMs])

  return { result, running, ms }
}
