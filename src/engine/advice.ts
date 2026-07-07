import { runSimulation } from './simulate'
import type { Account, Scenario, SimResult } from './types'

// ---------------------------------------------------------------------------
// The Coach: turns a scenario into concrete advice and goals. Every piece of
// advice that proposes a change is QUANTIFIED by actually re-running the
// simulation with that change applied (same seed, common random numbers, a
// reduced path count) and reporting the measured delta — no hand-waving.
// Runs inside the worker, so the variant sims never block the UI.
// ---------------------------------------------------------------------------

export type Severity = 'high' | 'medium' | 'low'

export interface Advice {
  id: string
  severity: Severity
  title: string
  detail: string
  // Measured vs. the same-seed baseline (absent for pure observations).
  deltaSuccess?: number // change in success probability, e.g. +0.06
  deltaMedian?: number // change in median ending net worth (today's $)
}

export interface Goal {
  id: string
  title: string
  detail: string
  current: number
  target: number
  unit: 'money' | 'pct'
  done: boolean
}

export interface CoachPlan {
  advice: Advice[]
  goals: Goal[]
  baseSuccess: number
  baseMedian: number
}

const VP = 500 // variant path count: fast, and deltas use common random numbers

const clone = (s: Scenario): Scenario => JSON.parse(JSON.stringify(s))

export function buildCoachPlan(s: Scenario): CoachPlan {
  const base = runSimulation({ ...clone(s), paths: VP })
  const variant = (mutate: (v: Scenario) => void): SimResult => {
    const v = clone(s)
    v.paths = VP
    mutate(v)
    return runSimulation(v)
  }

  // ---- snapshot metrics of "today" ----
  const activeNow = (x: { startAge: number; endAge: number }) =>
    s.currentAge >= x.startAge && s.currentAge <= x.endAge
  const yearsToRetire = s.retirementAge - s.currentAge
  const working = yearsToRetire > 0

  const grossIncome = s.incomes.filter(activeNow).reduce((t, i) => t + i.annualAmount, 0)
  const spending = s.expenses.filter(activeNow).reduce((t, e) => t + e.annualAmount, 0)
  const ownContrib = working
    ? s.contributions.filter(activeNow).reduce((t, c) => t + c.annualAmount, 0)
    : 0
  const savingsRate = grossIncome > 0 ? ownContrib / grossIncome : 0

  const cashBal = s.accounts.filter((a) => a.taxTreatment === 'cash').reduce((t, a) => t + a.balance, 0)
  const totalBal = s.accounts.reduce((t, a) => t + a.balance, 0)
  const weightedVol = totalBal > 0 ? s.accounts.reduce((t, a) => t + a.volatility * a.balance, 0) / totalBal : 0
  const investTarget: Account | undefined =
    s.accounts.find((a) => a.taxTreatment === 'taxable') ?? s.accounts.find((a) => a.taxTreatment !== 'cash')

  const advice: Advice[] = []
  const add = (a: Advice, r?: SimResult, requireGain = true) => {
    if (r) {
      a.deltaSuccess = r.successRate - base.successRate
      a.deltaMedian = r.endingP50 - base.endingP50
      // Drop "do X" advice whose measured effect is noise or harm. The $ floor
      // matters when the baseline median is ~$0 (a doomed plan): without it,
      // any $1 improvement would count as "meaningful".
      const meaningful = a.deltaSuccess >= 0.005 || a.deltaMedian >= Math.max(5000, Math.abs(base.endingP50) * 0.02)
      if (requireGain && !meaningful) return
    }
    advice.push(a)
  }

  // 0. Plan-coverage gaps: years the sim treats as $0 expenses (or income while
  // working) almost always mean the plan is lying to you, not that life is free.
  {
    const coveredExp = (age: number) => s.expenses.some((e) => age >= e.startAge && age <= e.endAge)
    let gapStart = -1
    let gapEnd = -1
    for (let age = s.currentAge; age <= s.endAge; age++)
      if (!coveredExp(age)) {
        if (gapStart < 0) gapStart = age
        gapEnd = age
      } else if (gapStart >= 0) break // report the first gap only
    if (gapStart >= 0)
      add({
        id: 'gap-expenses',
        severity: 'high',
        title: `No expenses from age ${gapStart} to ${gapEnd}`,
        detail: `Your plan has $0/yr of expenses for ${gapEnd - gapStart + 1} year${gapEnd > gapStart ? 's' : ''} (ages ${gapStart}–${gapEnd}), so every projection is rosier than reality. Extend an expense line to cover those years — or check that "current age" matches when your income/expense lines start.`,
      })
    const coveredInc = (age: number) => s.incomes.some((i) => age >= i.startAge && age <= i.endAge)
    if (working) {
      let iStart = -1
      let iEnd = -1
      for (let age = s.currentAge; age < s.retirementAge; age++)
        if (!coveredInc(age)) {
          if (iStart < 0) iStart = age
          iEnd = age
        } else if (iStart >= 0) break
      if (iStart >= 0)
        add({
          id: 'gap-income',
          severity: 'medium',
          title: `No income from age ${iStart} to ${iEnd}`,
          detail: `You're modeled as working until ${s.retirementAge}, but earn nothing for ages ${iStart}–${iEnd}. If that's not a planned sabbatical, extend an income stream to cover it.`,
        })
    }
  }

  // 0.5 Structural deficit: spending more than take-home pay is THE diagnosis
  // when it holds — no investment lever can outrun it.
  if (working && grossIncome > 0) {
    const afterTax = grossIncome * (1 - s.taxRate)
    if (afterTax < spending) {
      const shortfall = spending - afterTax
      add({
        id: 'deficit',
        severity: 'high',
        title: `You spend $${Math.round(shortfall / 12).toLocaleString()}/month more than you take home`,
        detail: `Income after tax is ~$${Math.round(afterTax).toLocaleString()}/yr against $${Math.round(spending).toLocaleString()}/yr of expenses. Until that gap closes, savings drain no matter how they're invested — fix this before anything else on this list.`,
      })
    }
  }

  // 1. Headline risk assessment (observation, no variant).
  if (base.successRate < 0.7)
    add({
      id: 'risk-high',
      severity: 'high',
      title: 'This plan runs out of money too often',
      detail: `Only ${Math.round(base.successRate * 100)}% of simulated lives stay solvent to ${s.endAge}${base.medianRuinAge ? `, and failing paths typically go broke around age ${base.medianRuinAge}` : ''}. The levers below are measured fixes — combine two or three of them.`,
    })
  else if (base.successRate < 0.85)
    add({
      id: 'risk-med',
      severity: 'medium',
      title: 'Solid base, but the downside needs shoring up',
      detail: `${Math.round(base.successRate * 100)}% of paths survive to ${s.endAge}. Most planners aim for 85–90%+. Small changes now compound: see the measured options below.`,
    })

  // 2. Save more (only meaningful while working).
  if (working && grossIncome > 0) {
    const extra = Math.max(3000, Math.round((grossIncome * 0.05) / 600) * 600)
    if (investTarget) {
      const r = variant((v) => {
        v.contributions.push({
          id: 'coach-extra',
          name: 'Extra saving',
          accountId: investTarget.id,
          annualAmount: extra,
          startAge: v.currentAge,
          endAge: v.retirementAge - 1,
          employerMatch: 0,
        })
      })
      add(
        {
          id: 'save-more',
          severity: base.successRate < 0.85 ? 'high' : 'low',
          title: `Save $${Math.round(extra / 12).toLocaleString()}/month more`,
          detail: `Putting an extra $${extra.toLocaleString()}/yr (~5% of income) into ${investTarget.name} until retirement.`,
        },
        r,
      )
    }
  }

  // 3. Retire two years later.
  if (working && base.successRate < 0.92) {
    const r = variant((v) => {
      const old = v.retirementAge
      v.retirementAge = Math.min(v.endAge - 1, old + 2)
      const shift = v.retirementAge - old
      for (const inc of v.incomes)
        if (inc.endAge >= old - 2 && inc.endAge <= old) inc.endAge += shift // extend the paycheck too
      for (const c of v.contributions) if (c.endAge >= old - 2 && c.endAge <= old) c.endAge += shift
    })
    add(
      {
        id: 'retire-later',
        severity: base.successRate < 0.75 ? 'high' : 'medium',
        title: 'Work two more years',
        detail: `Retiring at ${Math.min(s.endAge - 1, s.retirementAge + 2)} instead of ${s.retirementAge}: two more earning years, two fewer drawdown years.`,
      },
      r,
    )
  }

  // 4. Trim spending 10%.
  if (spending > 0) {
    const r = variant((v) => {
      for (const e of v.expenses) e.annualAmount *= 0.9
    })
    add(
      {
        id: 'spend-less',
        severity: base.successRate < 0.8 ? 'medium' : 'low',
        title: `Trim spending 10% (≈$${Math.round((spending * 0.1) / 12).toLocaleString()}/month)`,
        detail: 'A permanent 10% cut to every expense line — the double lever: more saved now, less needed forever.',
      },
      r,
    )
  }

  // 5. Idle cash drag.
  if (totalBal > 0 && cashBal / totalBal > 0.3 && yearsToRetire > 10 && investTarget) {
    const move = cashBal * 0.5
    const r = variant((v) => {
      for (const a of v.accounts) if (a.taxTreatment === 'cash') a.balance -= (a.balance / cashBal) * move
      const tgt = v.accounts.find((a) => a.id === investTarget.id)
      if (tgt) tgt.balance += move
    })
    add(
      {
        id: 'cash-drag',
        severity: 'medium',
        title: `Put idle cash to work ($${Math.round(move).toLocaleString()})`,
        detail: `${Math.round((cashBal / totalBal) * 100)}% of your portfolio sits in cash with ${yearsToRetire} years until retirement. Moving half into ${investTarget.name} (keep the rest as your buffer).`,
      },
      r,
    )
  }

  // 6. Aggressive withdrawal rate.
  if (s.withdrawal.strategy === 'percent' && s.withdrawal.percent > 0.045) {
    const r = variant((v) => {
      v.withdrawal.percent = 0.04
    })
    add(
      {
        id: 'wd-rate',
        severity: 'medium',
        title: `${(s.withdrawal.percent * 100).toFixed(1)}% withdrawal rate is aggressive`,
        detail: 'Historically, sustained withdrawal rates above ~4–4.5% meaningfully raise ruin risk. Measured at 4.0%:',
      },
      r,
      false, // show the measured delta even if small — it's a warning
    )
  }

  // 7. Portfolio risk close to retirement.
  if (yearsToRetire > 0 && yearsToRetire <= 10 && weightedVol > 0.13) {
    const r = variant((v) => {
      for (const a of v.accounts)
        if (a.volatility > 0.12) {
          a.volatility = 0.11
          a.meanReturn = Math.max(0.03, a.meanReturn - 0.01)
        }
    })
    add(
      {
        id: 'derisk',
        severity: 'medium',
        title: 'High volatility this close to retirement',
        detail: `Portfolio volatility is ~${Math.round(weightedVol * 100)}% with only ${yearsToRetire} years to go — a bad early-retirement crash is the classic plan-killer (sequence risk). Measured with a bond-tilted mix (11% vol, −1% return):`,
      },
      r,
      false,
    )
  }

  // 8. Optimistic assumptions (observation).
  const rosy = s.accounts.filter((a) => a.meanReturn > 0.09 && a.balance > 0)
  if (rosy.length > 0)
    add({
      id: 'rosy',
      severity: 'low',
      title: 'Return assumptions look optimistic',
      detail: `${rosy.map((a) => a.name).join(', ')} assume${rosy.length === 1 ? 's' : ''} >9%/yr nominal. Long-run equity returns averaged ~7–10% before fees and behavior. Try your plan at 1–2% lower to see how much rests on that assumption.`,
    })

  // ---- goals ----
  const goals: Goal[] = []
  if (spending > 0) {
    const target = (spending / 12) * 6
    goals.push({
      id: 'g-efund',
      title: 'Build a 6-month emergency fund',
      detail: `Six months of expenses ($${Math.round(target).toLocaleString()}) in cash so a bad year never forces you to sell investments low.`,
      current: cashBal,
      target,
      unit: 'money',
      done: cashBal >= target,
    })
  }
  if (working && grossIncome > 0) {
    const target = s.retirementAge < 55 ? 0.3 : 0.15
    goals.push({
      id: 'g-srate',
      title: `Save ${Math.round(target * 100)}% of gross income`,
      detail: `You currently put away ${(savingsRate * 100).toFixed(1)}% ($${Math.round(ownContrib).toLocaleString()}/yr of $${Math.round(grossIncome).toLocaleString()}).${s.retirementAge < 55 ? ' Early retirement demands an outsized savings rate.' : ''}`,
      current: savingsRate,
      target,
      unit: 'pct',
      done: savingsRate >= target,
    })
  }
  goals.push({
    id: 'g-success',
    title: 'Reach an 85% success rate',
    detail: 'The probability your money outlives the plan. 85–90% is the common comfort band — 100% usually means over-saving.',
    current: base.successRate,
    target: 0.85,
    unit: 'pct',
    done: base.successRate >= 0.85,
  })
  const MILESTONES = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000]
  const next = MILESTONES.find((m) => m > totalBal)
  if (next)
    goals.push({
      id: 'g-nw',
      title: `Next milestone: $${next.toLocaleString()} invested`,
      detail: `Across all accounts you hold $${Math.round(totalBal).toLocaleString()} today. Milestones make the abstract compounding curve feel concrete.`,
      current: totalBal,
      target: next,
      unit: 'money',
      done: false,
    })

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 }
  advice.sort((a, b) => rank[a.severity] - rank[b.severity])

  return { advice, goals, baseSuccess: base.successRate, baseMedian: base.endingP50 }
}
