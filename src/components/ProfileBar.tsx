import { useState } from 'react'
import { useStore } from '../state/store'
import {
  buildScenarioFromWizard,
  RISK_BLURBS,
  WIZARD_DEFAULTS,
  type CareerOutlook,
  type RiskLevel,
  type WizardAnswers,
} from '../state/profiles'
import { NumberField, SelectField, TextField } from './ui'

// Profile switcher: one chip per "life" being planned. The active chip exposes
// rename / duplicate / delete; "+ New profile" opens the quick-setup wizard.
export function ProfileBar() {
  const { profiles, activeId, switchProfile, renameProfile, duplicateProfile, deleteProfile } = useStore()
  const [wizardOpen, setWizardOpen] = useState(false)
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
      {wizardOpen && <Wizard onClose={() => setWizardOpen(false)} />}
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
// creates stays editable in the normal panels afterwards.
function Wizard({ onClose }: { onClose: () => void }) {
  const { createProfile } = useStore()
  const [a, setA] = useState<WizardAnswers>({ ...WIZARD_DEFAULTS })
  const set = (patch: Partial<WizardAnswers>) => setA((prev) => ({ ...prev, ...patch }))

  const create = () => {
    createProfile(a.name || 'New profile', buildScenarioFromWizard(a))
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>New profile — quick setup</h3>
        <p className="hint">A few questions about your life build a complete starting plan. Every number stays fully editable afterwards.</p>

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
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={create}>Create profile</button>
        </div>
      </div>
    </div>
  )
}
