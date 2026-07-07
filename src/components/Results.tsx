import { useMemo, useState } from 'react'
import { useStore } from '../state/store'
import { useSimulation } from '../state/useSimulation'
import { runSimulation } from '../engine/simulate'
import { PALETTE } from '../state/scenario'
import { money, pct } from './format'
import { FanChart, type Overlay } from './FanChart'
import { Coach } from './Coach'

export function Results() {
  const { scenario, saved } = useStore()
  const { result, running, ms } = useSimulation(scenario)
  const [nominal, setNominal] = useState(false)
  const [shown, setShown] = useState<Set<string>>(new Set())

  // Comparison overlays: median line of each saved scenario. Reduced path count
  // keeps this snappy on the main thread; recomputed only when saves change.
  const overlayData = useMemo(() => {
    const map = new Map<string, Overlay>()
    saved.forEach((sv, i) => {
      const r = runSimulation({ ...sv.scenario, paths: Math.min(400, sv.scenario.paths) })
      map.set(sv.id, { label: sv.scenario.name, color: PALETTE[(i + 3) % PALETTE.length], ages: r.bands.ages, p50: r.bands.p50 })
    })
    return map
  }, [saved])

  const overlays: Overlay[] = saved.filter((s) => shown.has(s.id)).map((s) => overlayData.get(s.id)!).filter(Boolean)

  if (!result) {
    return <div className="results empty">Running the first simulation…</div>
  }

  const succ = result.successRate
  const succClass = succ >= 0.85 ? 'good' : succ >= 0.6 ? 'warn' : 'bad'

  return (
    <div className="results">
      <div className="kpis">
        <Kpi big value={pct(succ, 0)} label={`chance money lasts to ${scenario.endAge}`} cls={succClass} />
        <Kpi value={money(result.endingP50, true)} label={`median net worth at ${scenario.endAge} (today's $)`} />
        <Kpi value={money(result.endingP10, true)} label="downside — 10th percentile" />
        <Kpi value={money(result.endingP90, true)} label="upside — 90th percentile" />
        <Kpi value={result.medianRuinAge ? `age ${result.medianRuinAge}` : '—'} label={result.medianRuinAge ? 'typical age money runs out (failed paths)' : 'no paths ran out of money'} cls={result.medianRuinAge ? 'warn' : 'good'} />
      </div>

      <div className="gauge">
        <div className={`gauge-fill ${succClass}`} style={{ width: `${Math.round(succ * 100)}%` }} />
        <span className="gauge-label">{pct(succ, 0)} of {result.paths.toLocaleString()} simulated lives stay solvent</span>
      </div>

      <div className="chart-head">
        <h3>Net worth over time</h3>
        <div className="toggle">
          <button className={!nominal ? 'on' : ''} onClick={() => setNominal(false)}>Today's $</button>
          <button className={nominal ? 'on' : ''} onClick={() => setNominal(true)}>Future $</button>
        </div>
      </div>
      <FanChart result={result} scenario={scenario} nominal={nominal} overlays={overlays} />
      <div className="legend">
        <span><span className="swatch band" /> 5–95% & 25–75% range</span>
        <span><span className="swatch line" /> median outcome</span>
        <span><span className="swatch retire" /> retirement</span>
        <span className="muted">{running ? 'simulating…' : `${result.paths.toLocaleString()} paths · ${ms.toFixed(0)} ms`}</span>
      </div>

      {saved.length > 0 && (
        <div className="compare">
          <h4>Compare saved scenarios</h4>
          <div className="compare-list">
            {saved.map((s, i) => (
              <label key={s.id} className="compare-item">
                <input
                  type="checkbox"
                  checked={shown.has(s.id)}
                  onChange={(e) => {
                    setShown((prev) => {
                      const n = new Set(prev)
                      e.target.checked ? n.add(s.id) : n.delete(s.id)
                      return n
                    })
                  }}
                />
                <span className="swatch" style={{ background: PALETTE[(i + 3) % PALETTE.length] }} />
                {s.scenario.name}
              </label>
            ))}
          </div>
        </div>
      )}

      <Coach />

      <Ledger nominal={nominal} rows={result.ledger} retireAge={scenario.retirementAge} />
    </div>
  )
}

function Kpi({ value, label, cls = '', big = false }: { value: string; label: string; cls?: string; big?: boolean }) {
  return (
    <div className={`kpi ${big ? 'kpi-big' : ''}`}>
      <div className={`kpi-v ${cls}`}>{value}</div>
      <div className="kpi-l">{label}</div>
    </div>
  )
}

function Ledger({ rows, nominal, retireAge }: { rows: import('../engine/types').LedgerRow[]; nominal: boolean; retireAge: number }) {
  const [open, setOpen] = useState(false)
  if (rows.length === 0) return null
  const view = open ? rows : rows.filter((_, i) => i % 5 === 0 || i === rows.length - 1)
  return (
    <div className="ledger">
      <div className="ledger-head">
        <h4>Year-by-year cash flow <span className="muted">(median assumptions)</span></h4>
        <button className="link-btn" onClick={() => setOpen((o) => !o)}>{open ? 'show every 5 years' : 'show every year'}</button>
      </div>
      <div className="ledger-scroll">
        <table>
          <thead>
            <tr>
              <th>age</th>
              <th>income</th>
              <th>expenses</th>
              <th>contrib</th>
              <th>tax</th>
              <th>withdrawn</th>
              <th>net worth</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.age} className={r.age === retireAge ? 'retire-row' : ''}>
                <td>{r.age}</td>
                <td>{money(r.income, true)}</td>
                <td>{money(r.expenses, true)}</td>
                <td>{r.contributions ? money(r.contributions, true) : '—'}</td>
                <td>{money(r.taxes, true)}</td>
                <td>{r.withdrawals ? money(r.withdrawals, true) : '—'}</td>
                <td className="nw">{money(nominal ? r.netWorth : r.netWorthReal, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">Flows are shown in that year's dollars. Net worth follows the {nominal ? 'future-dollar' : "today's-dollar"} toggle above.</p>
    </div>
  )
}
