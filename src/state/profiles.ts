import type { Scenario } from '../engine/types'
import { PALETTE, uid } from './scenario'
import type { SavedScenario } from './store'

// A profile is one "life" being planned: its own scenario, its own saved
// comparison snapshots, its own identity in the switcher. Everything else in
// the app operates on the ACTIVE profile.
export interface Profile {
  id: string
  name: string
  color: string
  createdAt: string
  scenario: Scenario
  saved: SavedScenario[]
}

export function newProfile(name: string, scenario: Scenario, index: number): Profile {
  return {
    id: uid(),
    name,
    color: PALETTE[index % PALETTE.length],
    createdAt: new Date().toISOString(),
    scenario,
    saved: [],
  }
}

// ---------------------------------------------------------------------------
// Quick-setup wizard: a handful of plain-language questions about your life,
// career, investing style and plans, mapped onto a full scenario. Everything
// it produces remains editable in the panels afterwards.
// ---------------------------------------------------------------------------

export type RiskLevel = 'conservative' | 'balanced' | 'aggressive'
export type CareerOutlook = 'stable' | 'rising' | 'uncertain'

export interface WizardAnswers {
  name: string
  age: number
  retireAge: number
  income: number // gross annual
  outlook: CareerOutlook
  spending: number // annual
  invested: number // total investable assets today
  cash: number // cash / emergency savings today
  risk: RiskLevel
  planHome: boolean
  planKids: boolean
}

export const WIZARD_DEFAULTS: WizardAnswers = {
  name: '',
  age: 25,
  retireAge: 65,
  income: 70000,
  outlook: 'stable',
  spending: 45000,
  invested: 20000,
  cash: 10000,
  risk: 'balanced',
  planHome: false,
  planKids: false,
}

// Risk priority → per-account return/vol assumptions (nominal).
const RISK: Record<RiskLevel, { mean: number; vol: number; blurb: string }> = {
  conservative: { mean: 0.055, vol: 0.09, blurb: 'bond-heavy, smoother ride' },
  balanced: { mean: 0.07, vol: 0.15, blurb: 'classic stock/bond mix' },
  aggressive: { mean: 0.085, vol: 0.19, blurb: 'stock-heavy, bigger swings' },
}
export const RISK_BLURBS = Object.fromEntries(Object.entries(RISK).map(([k, v]) => [k, v.blurb])) as Record<RiskLevel, string>

// Career outlook → real income growth above inflation.
const GROWTH: Record<CareerOutlook, number> = { stable: 0.005, rising: 0.02, uncertain: 0 }

export function buildScenarioFromWizard(a: WizardAnswers): Scenario {
  const { mean, vol } = RISK[a.risk]
  const retire = Math.max(a.age + 1, a.retireAge)
  const endAge = Math.max(95, retire + 5)

  const pretax = { id: uid(), name: '401(k) / IRA', balance: Math.round(a.invested * 0.65), taxTreatment: 'traditional' as const, meanReturn: mean, volatility: vol, color: PALETTE[0] }
  const brokerage = { id: uid(), name: 'Brokerage', balance: Math.round(a.invested * 0.35), taxTreatment: 'taxable' as const, meanReturn: mean, volatility: vol, color: PALETTE[1] }
  const cash = { id: uid(), name: 'Cash / HYSA', balance: a.cash, taxTreatment: 'cash' as const, meanReturn: 0.03, volatility: 0.01, color: PALETTE[2] }

  // Rough surplus after tax and spending, saved at 80% (nobody banks every dollar).
  const surplus = Math.max(0, a.income * 0.78 - a.spending)
  const totalSave = Math.round((surplus * 0.8) / 100) * 100
  const toPretax = Math.min(totalSave, 23500)
  const toBrokerage = Math.max(0, totalSave - toPretax)

  const s: Scenario = {
    name: `${a.name || 'My'} plan`,
    currentAge: a.age,
    endAge,
    retirementAge: retire,
    inflation: 0.025,
    taxRate: 0.22,
    returnModel: { kind: 'normal', df: 5 },
    correlation: 0.6,
    paths: 2000,
    seed: 12345,
    withdrawal: { strategy: 'fill-gap', annualAmount: a.spending, percent: 0.04 },
    accounts: [pretax, brokerage, cash],
    incomes: [
      { id: uid(), name: 'Salary', annualAmount: a.income, startAge: a.age, endAge: retire - 1, growth: GROWTH[a.outlook], taxable: true },
      { id: uid(), name: 'Social Security', annualAmount: 24000, startAge: Math.max(67, retire), endAge, growth: 0, taxable: true },
    ],
    expenses: [{ id: uid(), name: 'Living expenses', annualAmount: a.spending, startAge: a.age, endAge }],
    contributions: [],
    events: [],
  }

  if (toPretax > 0)
    s.contributions.push({ id: uid(), name: '401(k) contribution', accountId: pretax.id, annualAmount: toPretax, startAge: a.age, endAge: retire - 1, employerMatch: 0 })
  if (toBrokerage > 0)
    s.contributions.push({ id: uid(), name: 'Brokerage saving', accountId: brokerage.id, annualAmount: toBrokerage, startAge: a.age, endAge: retire - 1, employerMatch: 0 })

  if (a.planHome)
    s.events.push({ id: uid(), name: 'Home down payment', age: Math.min(retire - 1, a.age + 5), amount: -60000 })
  if (a.planKids)
    s.expenses.push({ id: uid(), name: 'Kids', annualAmount: 14000, startAge: a.age + 3, endAge: Math.min(endAge, a.age + 3 + 20) })

  return s
}
