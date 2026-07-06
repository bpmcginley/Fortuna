import type {
  Account,
  Contribution,
  Expense,
  IncomeStream,
  OneOffEvent,
  Scenario,
} from '../engine/types'

export function uid(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto
  if (c && 'randomUUID' in c) return c.randomUUID().slice(0, 8)
  return Math.random().toString(36).slice(2, 10)
}

// Palette used when auto-assigning colours to new accounts.
export const PALETTE = ['#58a6ff', '#d2a8ff', '#3fb950', '#d29922', '#f0883e', '#f85149', '#39c5cf', '#db61a2']

export function nextColor(used: number): string {
  return PALETTE[used % PALETTE.length]
}

// A sensible, non-empty starting point: an early-career saver with a 401(k),
// a brokerage account, and a cash buffer, retiring at 65.
export function defaultScenario(): Scenario {
  return {
    name: 'My plan',
    currentAge: 30,
    endAge: 95,
    retirementAge: 65,
    inflation: 0.025,
    taxRate: 0.22,
    returnModel: { kind: 'normal', df: 5 },
    correlation: 0.6,
    paths: 2000,
    seed: 12345,
    withdrawal: { strategy: 'fill-gap', annualAmount: 60000, percent: 0.04 },
    accounts: [
      { id: uid(), name: '401(k)', balance: 40000, taxTreatment: 'traditional', meanReturn: 0.07, volatility: 0.16, color: PALETTE[0] },
      { id: uid(), name: 'Brokerage', balance: 15000, taxTreatment: 'taxable', meanReturn: 0.07, volatility: 0.16, color: PALETTE[1] },
      { id: uid(), name: 'Cash / HYSA', balance: 20000, taxTreatment: 'cash', meanReturn: 0.03, volatility: 0.01, color: PALETTE[2] },
    ],
    incomes: [
      { id: uid(), name: 'Salary', annualAmount: 85000, startAge: 30, endAge: 64, growth: 0.01, taxable: true },
      { id: uid(), name: 'Social Security', annualAmount: 24000, startAge: 67, endAge: 95, growth: 0, taxable: true },
    ],
    expenses: [
      { id: uid(), name: 'Living expenses', annualAmount: 48000, startAge: 30, endAge: 95 },
    ],
    contributions: [
      { id: uid(), name: '401(k) contribution', accountId: '', annualAmount: 12000, startAge: 30, endAge: 64, employerMatch: 0.5 },
    ],
    events: [
      { id: uid(), name: 'Buy a home (down payment)', age: 34, amount: -80000 },
    ],
  }
}

// Wire the default contribution to the default 401(k) account id.
export function seedDefault(): Scenario {
  const s = defaultScenario()
  s.contributions[0].accountId = s.accounts[0].id
  return s
}

export interface Preset {
  key: string
  label: string
  blurb: string
  build: () => Scenario
}

export const PRESETS: Preset[] = [
  {
    key: 'grad',
    label: 'Fresh grad (22)',
    blurb: 'Just started working, small balances, long runway.',
    build: () => {
      const s = defaultScenario()
      s.name = 'Fresh grad'
      s.currentAge = 22
      const k401 = s.accounts[0]
      k401.balance = 3000
      s.accounts[1].balance = 1000
      s.accounts[2].balance = 6000
      s.incomes[0] = { id: uid(), name: 'Salary', annualAmount: 62000, startAge: 22, endAge: 64, growth: 0.015, taxable: true }
      s.incomes[1].startAge = 67
      s.expenses[0] = { id: uid(), name: 'Living expenses', annualAmount: 38000, startAge: 22, endAge: 95 }
      s.contributions = [
        { id: uid(), name: '401(k) contribution', accountId: k401.id, annualAmount: 7000, startAge: 22, endAge: 64, employerMatch: 0.5 },
      ]
      s.events = []
      return s
    },
  },
  {
    key: 'mid',
    label: 'Mid-career (40)',
    blurb: 'Peak earning years, house and kids in the mix.',
    build: () => {
      const s = defaultScenario()
      s.name = 'Mid-career'
      s.currentAge = 40
      s.accounts[0].balance = 220000
      s.accounts[1].balance = 90000
      s.accounts[2].balance = 40000
      s.incomes[0] = { id: uid(), name: 'Salary', annualAmount: 140000, startAge: 40, endAge: 64, growth: 0.01, taxable: true }
      s.expenses[0] = { id: uid(), name: 'Living expenses', annualAmount: 78000, startAge: 40, endAge: 95 }
      s.contributions = [
        { id: uid(), name: '401(k) contribution', accountId: s.accounts[0].id, annualAmount: 22500, startAge: 40, endAge: 64, employerMatch: 0.5 },
        { id: uid(), name: 'Brokerage saving', accountId: s.accounts[1].id, annualAmount: 12000, startAge: 40, endAge: 64, employerMatch: 0 },
      ]
      s.events = [{ id: uid(), name: 'College tuition', age: 52, amount: -100000 }]
      return s
    },
  },
  {
    key: 'fire',
    label: 'FIRE aspirant (28)',
    blurb: 'High savings rate, aiming to retire early at 45.',
    build: () => {
      const s = defaultScenario()
      s.name = 'FIRE aspirant'
      s.currentAge = 28
      s.retirementAge = 45
      s.accounts[0].balance = 60000
      s.accounts[1].balance = 120000
      s.accounts[2].balance = 25000
      s.incomes[0] = { id: uid(), name: 'Salary', annualAmount: 155000, startAge: 28, endAge: 44, growth: 0.01, taxable: true }
      s.incomes[1].startAge = 67
      s.expenses[0] = { id: uid(), name: 'Lean living', annualAmount: 42000, startAge: 28, endAge: 95 }
      s.contributions = [
        { id: uid(), name: '401(k) max', accountId: s.accounts[0].id, annualAmount: 22500, startAge: 28, endAge: 44, employerMatch: 0.5 },
        { id: uid(), name: 'Taxable saving', accountId: s.accounts[1].id, annualAmount: 45000, startAge: 28, endAge: 44, employerMatch: 0 },
      ]
      s.withdrawal = { strategy: 'percent', annualAmount: 42000, percent: 0.035 }
      s.events = []
      return s
    },
  },
  {
    key: 'retiree',
    label: 'Near retirement (60)',
    blurb: 'Nest egg built, testing whether it lasts.',
    build: () => {
      const s = defaultScenario()
      s.name = 'Near retirement'
      s.currentAge = 60
      s.retirementAge = 63
      s.accounts[0].balance = 900000
      s.accounts[1].balance = 350000
      s.accounts[2].balance = 80000
      s.accounts[0].volatility = 0.11
      s.accounts[1].volatility = 0.11
      s.incomes[0] = { id: uid(), name: 'Salary', annualAmount: 130000, startAge: 60, endAge: 62, growth: 0, taxable: true }
      s.incomes[1] = { id: uid(), name: 'Social Security', annualAmount: 34000, startAge: 67, endAge: 95, growth: 0, taxable: true }
      s.expenses[0] = { id: uid(), name: 'Living expenses', annualAmount: 72000, startAge: 60, endAge: 95 }
      s.contributions = []
      s.withdrawal = { strategy: 'fill-gap', annualAmount: 72000, percent: 0.04 }
      s.events = []
      return s
    },
  },
]

// ------------------------------ reducer ------------------------------------

// Named collections so list edits stay fully typed without per-collection actions.
type ListKey = 'accounts' | 'incomes' | 'expenses' | 'contributions' | 'events'
type ItemFor<K extends ListKey> = Scenario[K][number]

export type Action =
  | { type: 'patch'; patch: Partial<Scenario> }
  | { type: 'listAdd'; coll: ListKey; item: Account | IncomeStream | Expense | Contribution | OneOffEvent }
  | { type: 'listUpdate'; coll: ListKey; id: string; patch: Record<string, unknown> }
  | { type: 'listRemove'; coll: ListKey; id: string }
  | { type: 'load'; scenario: Scenario }

export function reducer(s: Scenario, action: Action): Scenario {
  switch (action.type) {
    case 'patch':
      return { ...s, ...action.patch }
    case 'load':
      return action.scenario
    case 'listAdd':
      return { ...s, [action.coll]: [...s[action.coll], action.item] as Scenario[ListKey] }
    case 'listRemove':
      return { ...s, [action.coll]: s[action.coll].filter((x) => x.id !== action.id) as Scenario[ListKey] }
    case 'listUpdate':
      return {
        ...s,
        [action.coll]: s[action.coll].map((x) =>
          x.id === action.id ? { ...x, ...action.patch } : x,
        ) as Scenario[ListKey],
      }
    default:
      return s
  }
}

export type { ListKey, ItemFor }
