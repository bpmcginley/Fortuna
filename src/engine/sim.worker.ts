/// <reference lib="webworker" />
import { runSimulation } from './simulate'
import type { Scenario } from './types'

export interface SimRequest {
  id: number
  scenario: Scenario
}

// Heavy Monte-Carlo runs here so typing in the inputs never janks the UI.
self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, scenario } = e.data
  try {
    const result = runSimulation(scenario)
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, result })
  } catch (err) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, error: String(err) })
  }
}
