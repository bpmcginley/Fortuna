/// <reference lib="webworker" />
import { runSimulation } from './simulate'
import { buildCoachPlan } from './advice'
import type { Scenario } from './types'

export interface SimRequest {
  id: number
  kind?: 'sim' | 'coach'
  scenario: Scenario
}

// Heavy work runs here so typing in the inputs never janks the UI:
// 'sim' → full Monte-Carlo bands/metrics; 'coach' → advice plan, which
// internally re-runs the sim for each proposed change to measure its impact.
self.onmessage = (e: MessageEvent<SimRequest>) => {
  const { id, kind, scenario } = e.data
  const post = (msg: object) => (self as DedicatedWorkerGlobalScope).postMessage({ id, ...msg })
  try {
    if (kind === 'coach') post({ plan: buildCoachPlan(scenario) })
    else post({ result: runSimulation(scenario) })
  } catch (err) {
    post({ error: String(err) })
  }
}
