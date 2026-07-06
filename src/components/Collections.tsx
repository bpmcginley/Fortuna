import { useStore } from '../state/store'
import type { TaxTreatment } from '../engine/types'
import { nextColor, uid } from '../state/scenario'
import { pct } from './format'
import { IconButton, NumberField, SelectField, SliderField, TextField } from './ui'

// Tiny inline card wrapper with a delete button and optional colour swatch.
function Card({ color, onRemove, children }: { color?: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <div className="item-card">
      {color && <span className="swatch" style={{ background: color }} />}
      <div className="item-fields">{children}</div>
      <IconButton title="Remove" onClick={onRemove}>
        ✕
      </IconButton>
    </div>
  )
}

const TAX_OPTS: { value: TaxTreatment; label: string }[] = [
  { value: 'taxable', label: 'Taxable' },
  { value: 'traditional', label: 'Pre-tax (401k/IRA)' },
  { value: 'roth', label: 'Roth' },
  { value: 'cash', label: 'Cash / HYSA' },
]

export function AccountsPanel() {
  const { scenario: s, dispatch } = useStore()
  const upd = (id: string, patch: Record<string, unknown>) => dispatch({ type: 'listUpdate', coll: 'accounts', id, patch })
  return (
    <div className="stack">
      {s.accounts.map((a) => (
        <Card key={a.id} color={a.color} onRemove={() => dispatch({ type: 'listRemove', coll: 'accounts', id: a.id })}>
          <div className="row">
            <TextField label="Name" value={a.name} onChange={(name) => upd(a.id, { name })} />
            <NumberField label="Balance" prefix="$" value={a.balance} min={0} step={1000} onChange={(balance) => upd(a.id, { balance })} />
            <SelectField label="Tax" value={a.taxTreatment} options={TAX_OPTS} onChange={(taxTreatment) => upd(a.id, { taxTreatment })} />
          </div>
          <div className="row">
            <SliderField label="Mean return" value={a.meanReturn} min={0} max={0.2} step={0.005} format={(v) => pct(v)} onChange={(meanReturn) => upd(a.id, { meanReturn })} />
            <SliderField label="Volatility" value={a.volatility} min={0} max={0.4} step={0.005} format={(v) => pct(v)} onChange={(volatility) => upd(a.id, { volatility })} />
          </div>
        </Card>
      ))}
      <button
        className="add-btn"
        onClick={() =>
          dispatch({
            type: 'listAdd',
            coll: 'accounts',
            item: { id: uid(), name: 'New account', balance: 10000, taxTreatment: 'taxable', meanReturn: 0.06, volatility: 0.14, color: nextColor(s.accounts.length) },
          })
        }
      >
        + Add account
      </button>
    </div>
  )
}

export function IncomePanel() {
  const { scenario: s, dispatch } = useStore()
  const upd = (id: string, patch: Record<string, unknown>) => dispatch({ type: 'listUpdate', coll: 'incomes', id, patch })
  return (
    <div className="stack">
      {s.incomes.map((inc) => (
        <Card key={inc.id} onRemove={() => dispatch({ type: 'listRemove', coll: 'incomes', id: inc.id })}>
          <div className="row">
            <TextField label="Source" value={inc.name} onChange={(name) => upd(inc.id, { name })} />
            <NumberField label="Per year" prefix="$" value={inc.annualAmount} min={0} step={1000} onChange={(annualAmount) => upd(inc.id, { annualAmount })} />
          </div>
          <div className="row">
            <NumberField label="From age" value={inc.startAge} min={0} max={120} onChange={(startAge) => upd(inc.id, { startAge })} />
            <NumberField label="To age" value={inc.endAge} min={0} max={120} onChange={(endAge) => upd(inc.id, { endAge })} />
            <SliderField label="Real growth" value={inc.growth} min={-0.05} max={0.08} step={0.0025} format={(v) => pct(v)} onChange={(growth) => upd(inc.id, { growth })} />
            <SelectField label="Taxable?" value={inc.taxable ? 'yes' : 'no'} options={[{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]} onChange={(v) => upd(inc.id, { taxable: v === 'yes' })} />
          </div>
        </Card>
      ))}
      <button
        className="add-btn"
        onClick={() =>
          dispatch({ type: 'listAdd', coll: 'incomes', item: { id: uid(), name: 'New income', annualAmount: 20000, startAge: s.currentAge, endAge: s.retirementAge - 1, growth: 0, taxable: true } })
        }
      >
        + Add income
      </button>
    </div>
  )
}

export function ExpensePanel() {
  const { scenario: s, dispatch } = useStore()
  const upd = (id: string, patch: Record<string, unknown>) => dispatch({ type: 'listUpdate', coll: 'expenses', id, patch })
  return (
    <div className="stack">
      {s.expenses.map((ex) => (
        <Card key={ex.id} onRemove={() => dispatch({ type: 'listRemove', coll: 'expenses', id: ex.id })}>
          <div className="row">
            <TextField label="Expense" value={ex.name} onChange={(name) => upd(ex.id, { name })} />
            <NumberField label="Per year" prefix="$" value={ex.annualAmount} min={0} step={1000} onChange={(annualAmount) => upd(ex.id, { annualAmount })} />
            <NumberField label="From age" value={ex.startAge} min={0} max={120} onChange={(startAge) => upd(ex.id, { startAge })} />
            <NumberField label="To age" value={ex.endAge} min={0} max={120} onChange={(endAge) => upd(ex.id, { endAge })} />
          </div>
        </Card>
      ))}
      <button
        className="add-btn"
        onClick={() =>
          dispatch({ type: 'listAdd', coll: 'expenses', item: { id: uid(), name: 'New expense', annualAmount: 12000, startAge: s.currentAge, endAge: s.endAge } })
        }
      >
        + Add expense
      </button>
    </div>
  )
}

export function ContribPanel() {
  const { scenario: s, dispatch } = useStore()
  const upd = (id: string, patch: Record<string, unknown>) => dispatch({ type: 'listUpdate', coll: 'contributions', id, patch })
  const acctOpts = s.accounts.map((a) => ({ value: a.id, label: a.name }))
  return (
    <div className="stack">
      {s.contributions.map((c) => (
        <Card key={c.id} onRemove={() => dispatch({ type: 'listRemove', coll: 'contributions', id: c.id })}>
          <div className="row">
            <TextField label="Name" value={c.name} onChange={(name) => upd(c.id, { name })} />
            <SelectField label="Into account" value={c.accountId} options={acctOpts.length ? acctOpts : [{ value: '', label: '(no accounts)' }]} onChange={(accountId) => upd(c.id, { accountId })} />
            <NumberField label="Per year" prefix="$" value={c.annualAmount} min={0} step={500} onChange={(annualAmount) => upd(c.id, { annualAmount })} />
          </div>
          <div className="row">
            <NumberField label="From age" value={c.startAge} min={0} max={120} onChange={(startAge) => upd(c.id, { startAge })} />
            <NumberField label="To age" value={c.endAge} min={0} max={120} onChange={(endAge) => upd(c.id, { endAge })} />
            <SliderField label="Employer match" value={c.employerMatch} min={0} max={1} step={0.05} format={(v) => pct(v, 0)} onChange={(employerMatch) => upd(c.id, { employerMatch })} />
          </div>
        </Card>
      ))}
      <button
        className="add-btn"
        onClick={() =>
          dispatch({ type: 'listAdd', coll: 'contributions', item: { id: uid(), name: 'New contribution', accountId: s.accounts[0]?.id ?? '', annualAmount: 6000, startAge: s.currentAge, endAge: s.retirementAge - 1, employerMatch: 0 } })
        }
      >
        + Add contribution
      </button>
    </div>
  )
}

export function EventsPanel() {
  const { scenario: s, dispatch } = useStore()
  const upd = (id: string, patch: Record<string, unknown>) => dispatch({ type: 'listUpdate', coll: 'events', id, patch })
  return (
    <div className="stack">
      {s.events.map((ev) => (
        <Card key={ev.id} onRemove={() => dispatch({ type: 'listRemove', coll: 'events', id: ev.id })}>
          <div className="row">
            <TextField label="Event" value={ev.name} onChange={(name) => upd(ev.id, { name })} />
            <NumberField label="At age" value={ev.age} min={s.currentAge} max={s.endAge} onChange={(age) => upd(ev.id, { age })} />
            <NumberField label="Amount (+/-)" prefix="$" value={ev.amount} step={1000} onChange={(amount) => upd(ev.id, { amount })} />
          </div>
        </Card>
      ))}
      <p className="hint">Negative amounts are costs (a home down-payment, a wedding); positive amounts are windfalls (an inheritance, selling a house).</p>
      <button
        className="add-btn"
        onClick={() => dispatch({ type: 'listAdd', coll: 'events', item: { id: uid(), name: 'New event', age: s.currentAge + 5, amount: -20000 } })}
      >
        + Add one-off event
      </button>
    </div>
  )
}
