// ---------------------------------------------------------------------------
// Fortuna domain model. Everything the simulator knows about a person's plan
// lives in a `Scenario`. All amounts are in TODAY's dollars unless a field is
// explicitly "nominal"; the engine handles inflation internally. Ages are in
// whole years and the simulation steps once per year.
// ---------------------------------------------------------------------------

export type TaxTreatment = 'taxable' | 'traditional' | 'roth' | 'cash'

// How yearly investment returns are drawn for a given account.
export type ReturnModelKind = 'fixed' | 'normal' | 'tdist' | 'lognormal'

export interface ReturnModel {
  kind: ReturnModelKind
  // Degrees of freedom for the Student-t model (fat tails). Ignored otherwise.
  df: number
}

// A pool of money that grows and can be contributed to / withdrawn from.
export interface Account {
  id: string
  name: string
  balance: number // starting balance, today's dollars
  taxTreatment: TaxTreatment
  meanReturn: number // expected NOMINAL annual return, e.g. 0.07
  volatility: number // annual standard deviation of return, e.g. 0.15
  color: string // for charts
}

// Money coming in: salary, pension, social security, rental, etc.
export interface IncomeStream {
  id: string
  name: string
  annualAmount: number // today's dollars, at startAge
  startAge: number
  endAge: number
  growth: number // annual growth ABOVE inflation (real), e.g. 0.01 for raises
  taxable: boolean
}

// Money going out that isn't a one-off: living costs, a mortgage payment, etc.
export interface Expense {
  id: string
  name: string
  annualAmount: number // today's dollars
  startAge: number
  endAge: number
}

// Money you deliberately move into an account while it applies (usually while
// working). Employer match is free money added on top of your own contribution.
export interface Contribution {
  id: string
  name: string
  accountId: string
  annualAmount: number // today's dollars
  startAge: number
  endAge: number
  employerMatch: number // fraction of annualAmount added free, e.g. 0.5
}

// A single dated cash event. Negative = cost (buy a house), positive = windfall.
export interface OneOffEvent {
  id: string
  name: string
  age: number
  amount: number // today's dollars; sign matters
}

export type WithdrawalStrategy =
  | 'fill-gap' // withdraw only what's needed to cover the spending shortfall
  | 'fixed-real' // spend a fixed real amount every retirement year
  | 'percent' // spend a % of the current portfolio (endowment style)

export interface WithdrawalPlan {
  strategy: WithdrawalStrategy
  annualAmount: number // for 'fixed-real': target real spend per year
  percent: number // for 'percent': fraction of portfolio, e.g. 0.04
}

export interface Scenario {
  name: string

  // Timeline
  currentAge: number
  endAge: number
  retirementAge: number // contributions stop, withdrawals begin

  // Macro
  inflation: number // annual, e.g. 0.025
  taxRate: number // simple effective rate on taxable income + traditional draws

  // Market model
  returnModel: ReturnModel
  correlation: number // 0..1 shared market factor across all accounts each year
  paths: number // Monte-Carlo path count
  seed: number // RNG seed for reproducibility

  withdrawal: WithdrawalPlan

  // Collections
  accounts: Account[]
  incomes: IncomeStream[]
  expenses: Expense[]
  contributions: Contribution[]
  events: OneOffEvent[]
}

// -------------------------- simulation output ------------------------------

// Percentile bands of net worth per simulated year (today's dollars if `real`).
export interface Bands {
  ages: number[]
  p5: number[]
  p25: number[]
  p50: number[]
  p75: number[]
  p95: number[]
}

export interface SimResult {
  bands: Bands
  real: boolean // were the bands deflated to today's dollars?
  // Fraction of paths still solvent (net worth > 0) at end age.
  successRate: number
  // Distribution summary of ending net worth (today's dollars).
  endingP10: number
  endingP50: number
  endingP90: number
  // Median age at which money runs out among paths that DO run out (or null).
  medianRuinAge: number | null
  // One fully-worked deterministic path (median assumptions) for the cash-flow
  // table: per-year income / expense / tax / withdrawal / net-worth breakdown.
  ledger: LedgerRow[]
  paths: number
}

export interface LedgerRow {
  age: number
  income: number
  expenses: number
  contributions: number
  taxes: number
  withdrawals: number
  netWorth: number // nominal at that year
  netWorthReal: number // deflated to today's dollars
}
