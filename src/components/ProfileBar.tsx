import { useState } from 'react'
import { useStore, wasFreshInstall } from '../state/store'
import {
  buildScenarioFromWizard,
  RISK_BLURBS,
  WIZARD_DEFAULTS,
  type CareerOutlook,
  type RiskLevel,
  type WizardAnswers,
} from '../state/profiles'
import { applyToWizard, MAX_DESCRIPTION_CHARS, textToPlan } from '../ai/client'
import type { ParsedEvent } from '../ai/schema'
import { uid } from '../state/scenario'
import { NumberField, SelectField, TextField } from './ui'

// Profile switcher: one chip per "life" being planned. The active chip exposes
// rename / duplicate / delete; "+ New profile" opens the quick-setup wizard.
export function ProfileBar() {
  const { profiles, activeId, switchProfile, renameProfile, duplicateProfile, deleteProfile } = useStore()
  // On a genuinely fresh install the wizard opens by itself, in "set up your
  // first profile" mode — newcomers answer a few questions instead of meeting
  // forty sliders.
  const [firstRun, setFirstRun] = useState(wasFreshInstall)
  const [wizardOpen, setWizardOpen] = useState(firstRun)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')

  const commitRename = () => {
    if (editingId) renameProfile(editingId, editName)
    setEditingId(null)
  }

  return (
    <div className="profilebar">
      <span className="profilebar-label">Profiles</span>
      {profiles.map((p) =>
        editingId === p.id ? (
          <input
            key={p.id}
            className="pchip-edit"
            value={editName}
            autoFocus
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setEditingId(null)
            }}
          />
        ) : (
          <span key={p.id} className={`pchip ${p.id === activeId ? 'on' : ''}`}>
            <button className="pchip-main" onClick={() => switchProfile(p.id)}>
              <span className="pchip-dot" style={{ background: p.color }} />
              {p.name}
            </button>
            {p.id === activeId && (
              <span className="pchip-ops">
                <button title="Rename" onClick={() => { setEditingId(p.id); setEditName(p.name) }}>✎</button>
                <button title="Duplicate" onClick={() => duplicateProfile(p.id)}>⧉</button>
                {profiles.length > 1 && (
                  <button
                    title="Delete profile"
                    onClick={() => {
                      if (confirm(`Delete profile "${p.name}" and its plan?`)) deleteProfile(p.id)
                    }}
                  >
                    ✕
                  </button>
                )}
              </span>
            )}
          </span>
        ),
      )}
      <button className="pchip-new" onClick={() => setWizardOpen(true)}>+ New profile</button>
      {wizardOpen && (
        <Wizard
          firstRun={firstRun}
          onClose={() => {
            setWizardOpen(false)
            setFirstRun(false)
          }}
        />
      )}
    </div>
  )
}

const RISK_OPTS: { value: RiskLevel; label: string }[] = [
  { value: 'conservative', label: 'Conservative' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'aggressive', label: 'Aggressive' },
]
const OUTLOOK_OPTS: { value: CareerOutlook; label: string }[] = [
  { value: 'stable', label: 'Steady (raises ≈ inflation)' },
  { value: 'rising', label: 'Rising fast (promotions ahead)' },
  { value: 'uncertain', label: 'Uncertain / variable' },
]

// Quick-setup wizard: life details → a fully-populated scenario. Everything it
// creates stays editable in the normal panels afterwards. In firstRun mode
// (fresh install) it fills in the default profile rather than adding a second.
function Wizard({ onClose, firstRun = false }: { onClose: () => void; firstRun?: boolean }) {
  const { createProfile, dispatch, renameProfile, activeId } = useStore()
  const [a, setA] = useState<WizardAnswers>({ ...WIZARD_DEFAULTS })
  const set = (patch: Partial<WizardAnswers>) => setA((prev) => ({ ...prev, ...patch }))

  // "Describe your situation" AI import
  const [desc, setDesc] = useState('')
  const [parsing, setParsing] = useState(false)
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [parseSource, setParseSource] = useState<'ai' | 'offline' | null>(null)
  const [parsedEvents, setParsedEvents] = useState<ParsedEvent[]>([])

  const runParse = async () => {
    if (!desc.trim() || parsing) return
    setParsing(true)
    try {
      const { parsed, source } = await textToPlan(desc)
      const { answers, events } = applyToWizard(parsed, a)
      setA(answers)
      setParsedEvents(events)
      setAssumptions(parsed.assumptions)
      setParseSource(source)
    } finally {
      setParsing(false)
    }
  }

  const create = () => {
    const scenario = buildScenarioFromWizard(a)
    // One-off events the parser picked up (a wedding, an inheritance, ...)
    for (const ev of parsedEvents) {
      if (ev.age > a.age && ev.age < scenario.endAge) {
        scenario.events.push({ id: uid(), name: ev.name, age: ev.age, amount: ev.amount })
      }
    }
    if (firstRun) {
      dispatch({ type: 'load', scenario })
      renameProfile(activeId, a.name || 'Me')
    } else {
      createProfile(a.name || 'New profile', scenario)
    }
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>{firstRun ? 'Welcome to Fortuna' : 'New profile — quick setup'}</h3>
        <p className="hint">
          {firstRun
            ? 'Answer a few plain-language questions and Fortuna builds your starting plan, then simulates thousands of possible futures for it. Everything stays fully editable.'
            : 'A few questions about your life build a complete starting plan. Every number stays fully editable afterwards.'}
        </p>

        <div className="ai-import">
          <label className="field-label" htmlFor="ai-desc">
            Or just describe your situation and let Fortuna fill this in
          </label>
          <textarea
            id="ai-desc"
            rows={3}
            maxLength={MAX_DESCRIPTION_CHARS}
            placeholder={'e.g. "I\'m 27, a nurse making $82k, have $20k in my 401k and $8k saved, rent is $1,500/month, want to buy a house in ~5 years and retire by 60."'}
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
          <div className="ai-import-row">
            <button className="primary" type="button" disabled={parsing || !desc.trim()} onClick={runParse}>
              {parsing ? 'Reading…' : '✨ Fill in from my description'}
            </button>
            {parseSource && (
              <span className={`ai-badge ${parseSource}`}>
                {parseSource === 'ai' ? 'parsed by AI' : 'parsed on-device'}
              </span>
            )}
          </div>
          {assumptions.length > 0 && (
            <ul className="ai-assumptions">
              {assumptions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          )}
          {parsedEvents.length > 0 && (
            <p className="hint">
              Also picked up {parsedEvents.length} life event{parsedEvents.length > 1 ? 's' : ''}:{' '}
              {parsedEvents.map((e) => `${e.name} (age ${e.age}, ${e.amount < 0 ? '-' : '+'}$${Math.abs(e.amount).toLocaleString()})`).join(', ')} — added to the plan on create.
            </p>
          )}
          <p className="hint ai-privacy">
            This one feature sends only the text above to Fortuna's parser service (free, no account). If it's
            unreachable, a fully on-device parser is used instead. Everything else never leaves your device —
            review the fields below before creating.
          </p>
        </div>

        <div className="wizard-grid">
          <TextField label="Who is this profile for?" value={a.name} onChange={(name) => set({ name })} />
          <div className="row">
            <NumberField label="Current age" value={a.age} min={16} max={90} onChange={(age) => set({ age })} />
            <NumberField label="Retire at" value={a.retireAge} min={a.age + 1} max={90} onChange={(retireAge) => set({ retireAge })} />
          </div>
          <div className="row">
            <NumberField label="Gross income / yr" prefix="$" value={a.income} min={0} step={1000} onChange={(income) => set({ income })} />
            <NumberField label="Spending / yr" prefix="$" value={a.spending} min={0} step={1000} onChange={(spending) => set({ spending })} />
          </div>
          <SelectField label="Career outlook" value={a.outlook} options={OUTLOOK_OPTS} onChange={(outlook) => set({ outlook })} />
          <div className="row">
            <NumberField label="Invested today" prefix="$" value={a.invested} min={0} step={1000} onChange={(invested) => set({ invested })} />
            <NumberField label="Cash savings" prefix="$" value={a.cash} min={0} step={500} onChange={(cash) => set({ cash })} />
          </div>
          <SelectField label="Investing style" value={a.risk} options={RISK_OPTS} onChange={(risk) => set({ risk })} />
          <p className="hint" style={{ marginTop: -4 }}>{RISK_BLURBS[a.risk]}</p>
          <div className="wizard-plans">
            <span className="field-label">Future plans</span>
            <label className="check"><input type="checkbox" checked={a.planHome} onChange={(e) => set({ planHome: e.target.checked })} /> Buy a home (~$60k down, in ~5 years)</label>
            <label className="check"><input type="checkbox" checked={a.planKids} onChange={(e) => set({ planKids: e.target.checked })} /> Kids (~$14k/yr for 20 years, starting in ~3)</label>
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>{firstRun ? 'Skip — explore a sample plan' : 'Cancel'}</button>
          <button className="primary" onClick={create}>{firstRun ? 'Build my plan' : 'Create profile'}</button>
        </div>
      </div>
    </div>
  )
}
