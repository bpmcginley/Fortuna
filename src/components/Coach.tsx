import { useStore } from '../state/store'
import { useCoach } from '../state/useCoach'
import type { Advice, Goal } from '../engine/advice'
import { money, pct } from './format'

// The Coach: measured advice ("do X → success +N pts") and progress-tracked
// goals, recomputed whenever the plan changes.
export function Coach() {
  const { scenario } = useStore()
  const { plan, running } = useCoach(scenario)

  if (!plan) return <div className="coach"><h3>Coach</h3><p className="hint">Analyzing your plan…</p></div>

  return (
    <div className={`coach ${running ? 'stale' : ''}`}>
      <div className="coach-head">
        <h3>Coach</h3>
        <span className="hint">{running ? 'reanalyzing…' : 'every suggestion below was measured by re-running your simulation with that one change'}</span>
      </div>

      {plan.advice.length === 0 ? (
        <p className="coach-clear">Nothing urgent — this plan holds up across the levers the coach tests. Stress-test it: try fat tails in the market model, or lower your return assumptions.</p>
      ) : (
        <div className="advice-list">
          {plan.advice.map((a) => <AdviceCard key={a.id} a={a} />)}
        </div>
      )}

      <h4 className="goals-title">Goals to work toward</h4>
      <div className="goals-grid">
        {plan.goals.map((g) => <GoalCard key={g.id} g={g} />)}
      </div>
    </div>
  )
}

function AdviceCard({ a }: { a: Advice }) {
  const gain = a.deltaSuccess !== undefined && a.deltaSuccess > 0
  return (
    <div className={`advice-card sev-${a.severity}`}>
      <div className="advice-top">
        <span className={`sev-dot ${a.severity}`} />
        <span className="advice-title">{a.title}</span>
        {a.deltaSuccess !== undefined && Math.abs(a.deltaSuccess) >= 0.005 && (
          <span className={`impact ${gain ? 'good' : ''}`}>
            {a.deltaSuccess >= 0 ? '+' : ''}{(a.deltaSuccess * 100).toFixed(0)} pts success
          </span>
        )}
        {a.deltaMedian !== undefined && Math.abs(a.deltaMedian) >= 1000 && (
          <span className={`impact ${a.deltaMedian > 0 ? 'good' : ''}`}>
            {a.deltaMedian >= 0 ? '+' : ''}{money(a.deltaMedian, true)} median
          </span>
        )}
      </div>
      <p className="advice-detail">{a.detail}</p>
    </div>
  )
}

function GoalCard({ g }: { g: Goal }) {
  const frac = g.target > 0 ? Math.min(1, g.current / g.target) : 0
  const fmt = (v: number) => (g.unit === 'money' ? money(v, true) : pct(v, 0))
  return (
    <div className={`goal ${g.done ? 'done' : ''}`}>
      <div className="goal-top">
        <span className="goal-title">{g.done ? '✓ ' : ''}{g.title}</span>
        <span className="goal-nums">{fmt(g.current)} / {fmt(g.target)}</span>
      </div>
      <div className="goal-bar"><div className="goal-fill" style={{ width: `${Math.round(frac * 100)}%` }} /></div>
      <p className="hint">{g.detail}</p>
    </div>
  )
}
