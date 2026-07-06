import { useStore } from '../state/store'
import type { ReturnModelKind, WithdrawalStrategy } from '../engine/types'
import { pct } from './format'
import { NumberField, SelectField, SliderField, TextField } from './ui'

export function PlanBasics() {
  const { scenario: s, dispatch } = useStore()
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'patch', patch })
  return (
    <div className="stack">
      <TextField label="Scenario name" value={s.name} onChange={(name) => set({ name })} />
      <div className="row">
        <NumberField label="Current age" value={s.currentAge} min={0} max={100} onChange={(currentAge) => set({ currentAge })} />
        <NumberField label="Retire at" value={s.retirementAge} min={s.currentAge} max={100} onChange={(retirementAge) => set({ retirementAge })} />
        <NumberField label="Plan to age" value={s.endAge} min={s.currentAge + 1} max={120} onChange={(endAge) => set({ endAge })} />
      </div>
      <SliderField label="Inflation" value={s.inflation} min={0} max={0.08} step={0.001} format={(v) => pct(v)} onChange={(inflation) => set({ inflation })} />
      <SliderField label="Effective tax rate" value={s.taxRate} min={0} max={0.5} step={0.005} format={(v) => pct(v)} onChange={(taxRate) => set({ taxRate })} />
      <p className="hint">Tax is a simple effective rate applied to taxable income and pre-tax (traditional) withdrawals. Roth, cash and taxable-account draws are treated as tax-free here.</p>
    </div>
  )
}

const MODEL_OPTS: { value: ReturnModelKind; label: string }[] = [
  { value: 'normal', label: 'Normal (Gaussian)' },
  { value: 'tdist', label: 'Fat tails (Student-t)' },
  { value: 'lognormal', label: 'Lognormal (no -100%)' },
  { value: 'fixed', label: 'Fixed (no randomness)' },
]

export function MarketModel() {
  const { scenario: s, dispatch } = useStore()
  const set = (patch: Partial<typeof s>) => dispatch({ type: 'patch', patch })
  return (
    <div className="stack">
      <SelectField
        label="Return model"
        value={s.returnModel.kind}
        options={MODEL_OPTS}
        onChange={(kind) => set({ returnModel: { ...s.returnModel, kind } })}
      />
      {s.returnModel.kind === 'tdist' && (
        <NumberField
          label="Tail heaviness (t d.o.f. — lower = fatter)"
          value={s.returnModel.df}
          min={2.5}
          max={30}
          step={0.5}
          onChange={(df) => set({ returnModel: { ...s.returnModel, df } })}
        />
      )}
      <SliderField label="Cross-account correlation" value={s.correlation} min={0} max={1} step={0.05} format={(v) => v.toFixed(2)} onChange={(correlation) => set({ correlation })} />
      <div className="row">
        <NumberField label="Monte-Carlo paths" value={s.paths} min={100} max={20000} step={100} onChange={(paths) => set({ paths })} />
        <NumberField label="Random seed" value={s.seed} min={1} max={1e9} onChange={(seed) => set({ seed })} />
      </div>
      <p className="hint">Per-account mean return and volatility live on each account. Correlation binds them to a shared market factor each year — turn it up and diversification helps less.</p>
    </div>
  )
}

const STRAT_OPTS: { value: WithdrawalStrategy; label: string }[] = [
  { value: 'fill-gap', label: 'Cover the gap (spend = expenses)' },
  { value: 'fixed-real', label: 'Fixed real amount / year' },
  { value: 'percent', label: 'Percent of portfolio / year' },
]

export function WithdrawalPanel() {
  const { scenario: s, dispatch } = useStore()
  const w = s.withdrawal
  const set = (patch: Partial<typeof w>) => dispatch({ type: 'patch', patch: { withdrawal: { ...w, ...patch } } })
  return (
    <div className="stack">
      <SelectField label="Retirement withdrawal" value={w.strategy} options={STRAT_OPTS} onChange={(strategy) => set({ strategy })} />
      {w.strategy === 'fixed-real' && (
        <NumberField label="Annual spend (today's $)" prefix="$" value={w.annualAmount} min={0} step={1000} onChange={(annualAmount) => set({ annualAmount })} />
      )}
      {w.strategy === 'percent' && (
        <SliderField label="Withdrawal rate" value={w.percent} min={0.01} max={0.1} step={0.0025} format={(v) => pct(v, 2)} onChange={(percent) => set({ percent })} />
      )}
      <p className="hint">
        {w.strategy === 'fill-gap' && 'Withdraws only what your expense lines need after income — the simplest, most literal model.'}
        {w.strategy === 'fixed-real' && 'Draws the same inflation-adjusted amount every year regardless of markets. Surplus is re-saved; shortfalls draw more.'}
        {w.strategy === 'percent' && "Draws a share of the current balance each year — spending flexes with the portfolio, so you can't fully run out but lean years bite."}
      </p>
    </div>
  )
}
