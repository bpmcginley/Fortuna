import { useEffect, useRef, useState } from 'react'
import { buildCoachPlan, type CoachPlan } from '../engine/advice'
import type { Scenario } from '../engine/types'

// Drives the Coach: whenever the scenario settles (longer debounce than the
// main sim — advice re-runs several variant simulations), ask the worker for a
// fresh plan. Falls back to computing inline if the worker can't start.
export function useCoach(scenario: Scenario, debounceMs = 600) {
  const [plan, setPlan] = useState<CoachPlan | null>(null)
  const [running, setRunning] = useState(false)
  const workerRef = useRef<Worker | null>(null)
  const reqId = useRef(0)
  const latest = useRef(scenario)
  latest.current = scenario

  useEffect(() => {
    try {
      const w = new Worker(new URL('../engine/sim.worker.ts', import.meta.url), { type: 'module' })
      w.onmessage = (e: MessageEvent<{ id: number; plan?: CoachPlan; error?: string }>) => {
        if (e.data.id !== reqId.current) return
        setRunning(false)
        if (e.data.plan) setPlan(e.data.plan)
      }
      w.onerror = () => {
        w.terminate()
        workerRef.current = null
        setPlan(buildCoachPlan(latest.current))
        setRunning(false)
      }
      workerRef.current = w
    } catch {
      workerRef.current = null
    }
    return () => workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    const id = ++reqId.current
    setRunning(true)
    const handle = setTimeout(() => {
      const w = workerRef.current
      if (w) {
        w.postMessage({ id, kind: 'coach', scenario })
      } else {
        setTimeout(() => {
          if (id !== reqId.current) return
          setPlan(buildCoachPlan(scenario))
          setRunning(false)
        }, 0)
      }
    }, debounceMs)
    return () => clearTimeout(handle)
  }, [scenario, debounceMs])

  return { plan, running }
}
