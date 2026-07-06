import type {
  Account,
  LedgerRow,
  ReturnModel,
  Scenario,
  SimResult,
} from './types'
import { mulberry32, normal, studentT, type Rng } from './random'

// A single account's mutable balance during one simulated life.
interface Book {
  bal: number
  acct: Account
}

const FLOOR = 0.02 // a single year can lose at most 98% (guards normal-model tails)

// Draw this year's growth factor for every account, sharing a market factor so
// accounts move together by `rho`. For the fat-tailed model a single per-year
// scale is shared across accounts, which correlates their tail events too.
function drawYearFactors(
  rng: Rng,
  books: Book[],
  model: ReturnModel,
  rho: number,
): number[] {
  const zMarket = model.kind === 'fixed' ? 0 : normal(rng)
  const a = Math.sqrt(Math.max(0, Math.min(1, rho)))
  const b = Math.sqrt(1 - a * a)

  return books.map((bk) => {
    const { meanReturn: mu, volatility: vol } = bk.acct
    if (model.kind === 'fixed' || vol <= 0) return 1 + mu

    const z = a * zMarket + b * normal(rng)
    let r: number
    switch (model.kind) {
      case 'normal':
        r = mu + vol * z
        break
      case 'tdist': {
        // Correlated normal shock, fattened by a per-account unit-variance t scale.
        const t = studentT(rng, Math.max(2.1, model.df))
        r = mu + vol * (0.5 * z + 0.5 * t) * 1.0
        break
      }
      case 'lognormal': {
        // Match mean/vol of a lognormal so returns can never drop below -100%.
        const s2 = Math.log(1 + (vol * vol) / ((1 + mu) * (1 + mu)))
        const muX = Math.log(1 + mu) - s2 / 2
        r = Math.exp(muX + Math.sqrt(s2) * z) - 1
        break
      }
      default:
        r = mu
    }
    return Math.max(FLOOR, 1 + r)
  })
}

interface PathOut {
  nw: number[] // nominal net worth at each age, currentAge..endAge
  ruinAge: number | null
  ledger?: LedgerRow[]
}

// Simulate one lifetime. `deterministic` forces every account to its mean
// return (used for the cash-flow ledger). `recordLedger` captures the per-year
// breakdown for the table.
export function simulatePath(
  s: Scenario,
  rng: Rng,
  deterministic: boolean,
  recordLedger: boolean,
): PathOut {
  const model: ReturnModel = deterministic ? { kind: 'fixed', df: s.returnModel.df } : s.returnModel
  const books: Book[] = s.accounts.map((a) => ({ bal: a.balance, acct: a }))
  const sweep = pickSweep(books)
  const years = Math.max(0, s.endAge - s.currentAge)
  const nw: number[] = new Array(years + 1)
  const ledger: LedgerRow[] | undefined = recordLedger ? [] : undefined
  let ruinAge: number | null = null

  nw[0] = sum(books)

  for (let k = 0; k < years; k++) {
    const age = s.currentAge + k
    const infl = Math.pow(1 + s.inflation, k) // today's $ -> this year's $
    const portfolioStart = sum(books)

    // --- income (nominal) ---
    let income = 0
    let taxableIncome = 0
    for (const inc of s.incomes) {
      if (age < inc.startAge || age > inc.endAge) continue
      const amt = inc.annualAmount * Math.pow(1 + inc.growth, age - inc.startAge) * infl
      income += amt
      if (inc.taxable) taxableIncome += amt
    }

    // --- expenses (nominal, inflation-tracked) ---
    let expenses = 0
    for (const ex of s.expenses) {
      if (age < ex.startAge || age > ex.endAge) continue
      expenses += ex.annualAmount * infl
    }

    // --- one-off events at this exact age ---
    let eventNet = 0
    for (const ev of s.events) if (ev.age === age) eventNet += ev.amount * infl

    // --- contributions (only while working) ---
    let ownContrib = 0
    if (age < s.retirementAge) {
      for (const c of s.contributions) {
        if (age < c.startAge || age > c.endAge) continue
        const own = c.annualAmount * infl
        const bk = books.find((b) => b.acct.id === c.accountId)
        if (!bk) continue
        bk.bal += own * (1 + Math.max(0, c.employerMatch))
        ownContrib += own
      }
    }

    let taxes = s.taxRate * taxableIncome
    let cash = income - taxes - expenses - ownContrib + eventNet

    // --- planned retirement withdrawal (strategy-driven), then top-up the gap ---
    let withdrawals = 0
    if (age >= s.retirementAge) {
      let planned = 0
      if (s.withdrawal.strategy === 'fixed-real') planned = s.withdrawal.annualAmount * infl
      else if (s.withdrawal.strategy === 'percent') planned = s.withdrawal.percent * portfolioStart
      if (planned > 0) {
        const got = withdraw(books, planned, s.taxRate)
        cash += got.net
        taxes += got.tax
        withdrawals += got.gross
      }
    }

    if (cash < 0) {
      // Shortfall: pull whatever we can to cover it.
      const got = withdraw(books, -cash, s.taxRate)
      cash += got.net
      taxes += got.tax
      withdrawals += got.gross
      if (cash < -1e-6 && ruinAge === null) ruinAge = age // couldn't fully cover
    }

    if (cash > 0 && sweep) sweep.bal += cash // surplus is saved

    // --- growth on the (post-flow) balances ---
    const factors = drawYearFactors(rng, books, model, s.correlation)
    for (let i = 0; i < books.length; i++) books[i].bal = Math.max(0, books[i].bal * factors[i])

    const nowNw = sum(books)
    nw[k + 1] = nowNw

    ledger?.push({
      age,
      income,
      expenses,
      contributions: ownContrib,
      taxes,
      withdrawals,
      netWorth: nowNw,
      netWorthReal: nowNw / (infl * (1 + s.inflation)),
    })
  }

  return { nw, ruinAge, ledger }
}

// Withdraw `need` spendable dollars across accounts in a sensible order,
// grossing up traditional (pre-tax) withdrawals for tax. Returns what was
// actually freed (`net`), the gross removed, and tax incurred.
function withdraw(books: Book[], need: number, taxRate: number) {
  const order = ['cash', 'taxable', 'traditional', 'roth'] as const
  let net = 0
  let tax = 0
  let gross = 0
  for (const treatment of order) {
    if (need - net <= 1e-9) break
    for (const bk of books) {
      if (bk.acct.taxTreatment !== treatment || bk.bal <= 0) continue
      const remaining = need - net
      if (remaining <= 1e-9) break
      if (treatment === 'traditional') {
        const grossNeeded = remaining / Math.max(1e-6, 1 - taxRate)
        const take = Math.min(bk.bal, grossNeeded)
        bk.bal -= take
        gross += take
        tax += take * taxRate
        net += take * (1 - taxRate)
      } else {
        const take = Math.min(bk.bal, remaining)
        bk.bal -= take
        gross += take
        net += take
      }
    }
  }
  return { net, tax, gross }
}

function pickSweep(books: Book[]): Book | null {
  return (
    books.find((b) => b.acct.taxTreatment === 'taxable') ??
    books.find((b) => b.acct.taxTreatment === 'cash') ??
    books[0] ??
    null
  )
}

function sum(books: Book[]): number {
  let t = 0
  for (const b of books) t += b.bal
  return t
}

// Run the full Monte-Carlo experiment and reduce it to bands + metrics.
export function runSimulation(s: Scenario): SimResult {
  const years = Math.max(0, s.endAge - s.currentAge)
  const cols = years + 1
  const P = Math.max(1, Math.min(20000, Math.floor(s.paths)))
  const rng = mulberry32(s.seed || 1)

  // nwReal[path][year] deflated to today's dollars for intuitive bands.
  const nwReal: Float64Array[] = new Array(P)
  const ruinAges: number[] = []
  let solventAtEnd = 0

  for (let p = 0; p < P; p++) {
    const out = simulatePath(s, rng, false, false)
    const row = new Float64Array(cols)
    for (let k = 0; k < cols; k++) row[k] = out.nw[k] / Math.pow(1 + s.inflation, k)
    nwReal[p] = row
    if (out.ruinAge !== null) ruinAges.push(out.ruinAge)
    if (out.nw[cols - 1] > 1) solventAtEnd++
  }

  const ages = Array.from({ length: cols }, (_, k) => s.currentAge + k)
  const col = new Float64Array(P)
  const band = (q: number): number[] => {
    const idx = Math.min(P - 1, Math.max(0, Math.floor(q * P)))
    return ages.map((_, k) => {
      for (let p = 0; p < P; p++) col[p] = nwReal[p][k]
      const sorted = Float64Array.from(col).sort()
      return sorted[idx]
    })
  }

  // Ending distribution (today's dollars).
  for (let p = 0; p < P; p++) col[p] = nwReal[p][cols - 1]
  const endSorted = Float64Array.from(col).sort()
  const q = (f: number) => endSorted[Math.min(P - 1, Math.max(0, Math.floor(f * P)))]

  const ledger = simulatePath(s, mulberry32(s.seed || 1), true, true).ledger ?? []

  ruinAges.sort((a, b) => a - b)
  const medianRuinAge = ruinAges.length ? ruinAges[Math.floor(ruinAges.length / 2)] : null

  return {
    bands: {
      ages,
      p5: band(0.05),
      p25: band(0.25),
      p50: band(0.5),
      p75: band(0.75),
      p95: band(0.95),
    },
    real: true,
    successRate: solventAtEnd / P,
    endingP10: q(0.1),
    endingP50: q(0.5),
    endingP90: q(0.9),
    medianRuinAge,
    ledger,
    paths: P,
  }
}
