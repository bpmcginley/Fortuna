import { emptySituation, type ParsedSituation } from './schema'

// On-device parser: regex/keyword extraction over the constrained vocabulary of
// personal-finance descriptions. No network, no AI — this is the always-works,
// fully-private fallback, so it favors precision over recall: it only fills a
// field when the text says it fairly plainly, and records everything it did in
// `assumptions`.

// "95k" -> 95000, "1.2m" -> 1200000, "85,000" -> 85000
function toDollars(num: string, suffix?: string): number {
  const n = parseFloat(num.replace(/,/g, ''))
  if (suffix?.toLowerCase() === 'k') return n * 1_000
  if (suffix?.toLowerCase() === 'm') return n * 1_000_000
  return n
}

const MONEY = String.raw`\$?\s*(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*(k|m)?\b`
const PER = String.raw`(?:\s*(?:a|per|each|\/)\s*|\s+)(year|yr|annum|annually|month|mo|monthly)`

function isMonthly(period: string | undefined): boolean {
  return !!period && /^mo/.test(period)
}

export function parseHeuristic(text: string): ParsedSituation {
  const out = emptySituation()
  const t = text.trim()
  if (!t) return out
  const note = (s: string) => out.assumptions.push(s)

  // ---- age: "I'm 24", "I am 24", "24 years old", "age 24" ----
  const age =
    t.match(/\b(?:i(?:'|’)?m|i am)\s+(\d{2})\b(?!\s*%)/i) ??
    t.match(/\b(\d{2})\s*(?:-|\s)?\s*years?\s*(?:-|\s)?\s*old\b/i) ??
    t.match(/\bage\s+(\d{2})\b/i)
  if (age) {
    const v = parseInt(age[1], 10)
    if (v >= 14 && v <= 90) out.age = v
  }

  // ---- retirement: "retire at 55", "retire by 60", "retiring when I'm 58" ----
  const retire = t.match(/\bretir\w*\s+(?:early\s+)?(?:at|by|around|when i(?:'|’)?m)\s+(\d{2})\b/i)
  if (retire) {
    const v = parseInt(retire[1], 10)
    if (v >= 30 && v <= 90) out.retireAge = v
  }

  // ---- income: "make $95k", "salary of 85,000", "earn 7k a month", "paid 120k/yr" ----
  const income = t.match(
    new RegExp(
      String.raw`\b(?:make|making|makes|earn(?:ing|s)?|salary(?:\s+(?:of|is))?|income(?:\s+(?:of|is))?|paid|bring(?:ing)?\s+(?:home|in))\s+(?:about|around|roughly|~|approx\.?|)\s*` +
        MONEY +
        String.raw`(?:${PER})?`,
      'i',
    ),
  )
  if (income) {
    let v = toDollars(income[1], income[2])
    if (isMonthly(income[3])) {
      v *= 12
      note(`Treated income of ${income[0].trim()} as monthly → $${Math.round(v).toLocaleString()}/yr`)
    }
    if (v >= 1_000) out.incomeAnnual = Math.round(v)
  }

  // ---- spending: "spend $4k/month", "expenses are 50k a year", "cost of living ~3k/mo" ----
  const spend = t.match(
    new RegExp(
      String.raw`\b(?:spend(?:ing|s)?|expenses?(?:\s+(?:are|of|is))?|cost of living(?:\s+is)?|living costs?(?:\s+(?:are|of))?)\s+(?:about|around|roughly|~|)\s*` +
        MONEY +
        String.raw`(?:${PER})?`,
      'i',
    ),
  )
  if (spend) {
    let v = toDollars(spend[1], spend[2])
    if (isMonthly(spend[3]) || (!spend[3] && v < 15_000)) {
      // an unlabeled small spending number almost always means per-month
      if (!spend[3]) note(`Assumed spending "${spend[0].trim()}" is per month`)
      v *= 12
    }
    if (v >= 1_000) out.spendingAnnual = Math.round(v)
  }

  // ---- rent (used as a spending floor when no overall spending was given) ----
  const rent = t.match(new RegExp(String.raw`\brent(?:(?:'|’)?s|\s+is)?\s+(?:about|around|roughly|~|)\s*` + MONEY, 'i'))
  if (rent && out.spendingAnnual === null) {
    const monthly = toDollars(rent[1], rent[2])
    if (monthly >= 200 && monthly <= 20_000) {
      out.spendingAnnual = Math.round(monthly * 12 * 1.8)
      note(`Only rent ($${Math.round(monthly).toLocaleString()}/mo) was mentioned — estimated total spending at ~1.8× rent. Adjust it!`)
    }
  }

  // ---- invested assets: "30k in my 401k", "portfolio of 120k", "50k invested" ----
  const invested =
    t.match(new RegExp(MONEY + String.raw`\s+(?:in|into)\s+(?:my\s+|a\s+|)(?:401\s*\(?k\)?|ira|roth|index funds?|stocks?|investments?|brokerage|portfolio|the market)`, 'i')) ??
    t.match(new RegExp(String.raw`\b(?:401\s*\(?k\)?|ira|roth|portfolio|investments?|brokerage)\s+(?:of|has|worth|at|is|with)\s+(?:about|around|~|)\s*` + MONEY, 'i')) ??
    t.match(new RegExp(MONEY + String.raw`\s+invested\b`, 'i'))
  if (invested) {
    const v = toDollars(invested[1], invested[2])
    if (v >= 100) out.invested = Math.round(v)
  }

  // ---- cash savings: "8k saved", "savings of 10k", "12k in the bank / emergency fund" ----
  const cash =
    t.match(new RegExp(MONEY + String.raw`\s+(?:saved(?!\s+(?:in|into))|in\s+(?:savings|cash|the bank|my bank|an?\s+emergency fund))`, 'i')) ??
    t.match(new RegExp(String.raw`\b(?:savings?|emergency fund|cash)\s+(?:of|is|are|at|around|about)\s+(?:about|around|~|)\s*` + MONEY, 'i'))
  if (cash) {
    const v = toDollars(cash[1], cash[2])
    if (v >= 50) out.cash = Math.round(v)
  }

  // ---- risk style ----
  if (/\b(?:aggressive|high[- ]risk|risky|all[- ]in|100% stocks)\b/i.test(t)) out.risk = 'aggressive'
  else if (/\b(?:conservative|low[- ]risk|risk[- ]averse|safe|cautious)\b/i.test(t)) out.risk = 'conservative'

  // ---- career outlook ----
  if (/\b(?:promotion|promoted|fast[- ]growing|career is growing|big raises?|rising|moving up)\b/i.test(t)) out.outlook = 'rising'
  else if (/\b(?:freelance|freelancer|contract(?:or)?|gig|unstable|uncertain|variable income|between jobs)\b/i.test(t)) out.outlook = 'uncertain'

  // ---- plans ----
  if (/\bbuy(?:ing)?\s+(?:a\s+|my (?:first|own)\s+)?(?:house|home|condo|apartment|place)\b/i.test(t)) out.planHome = true
  if (/\b(?:no|don(?:'|’)?t want|not having|without)\s+(?:any\s+)?(?:kids?|children)\b/i.test(t)) out.planKids = false
  else if (/\b(?:want|planning(?:\s+on)?|plan(?:\s+(?:to|on))?|have|having|expecting)\s+(?:\w+\s){0,2}?(?:kids?|children|a baby)\b/i.test(t)) out.planKids = true

  // ---- name: "my name is Alex", "I'm Alex," (word, capitalized, not a number context) ----
  // case-sensitive capture keeps the requirement that the NAME is capitalized
  const name = t.match(/\b[Mm]y name(?:'|’)?s?\s+(?:is\s+)?([A-Z][a-z]{1,20})\b/)
  if (name) out.name = name[1]

  const found = [
    out.age !== null && 'age',
    out.retireAge !== null && 'retirement age',
    out.incomeAnnual !== null && 'income',
    out.spendingAnnual !== null && 'spending',
    out.invested !== null && 'investments',
    out.cash !== null && 'cash savings',
    out.risk !== null && 'risk style',
    out.outlook !== null && 'career outlook',
    out.planHome !== null && 'home plan',
    out.planKids !== null && 'kids plan',
  ].filter(Boolean)
  if (found.length === 0) note('Could not confidently extract anything — fill the fields in manually.')
  else note(`Found on-device: ${found.join(', ')}. Anything not listed kept its default.`)

  return out
}
