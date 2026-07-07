import { WIZARD_DEFAULTS, type WizardAnswers } from '../state/profiles'
import { parseHeuristic } from './heuristic'
import { emptySituation, type ParsedEvent, type ParseResult, type ParsedSituation } from './schema'

// Default hosted parser endpoint (a Cloudflare Worker holding the project's
// Anthropic key — see worker/ in the repo). Overridable without a rebuild via
// localStorage['fortuna:ai-endpoint'] (set to '' to force offline parsing).
export const DEFAULT_AI_ENDPOINT = 'https://fortuna-parse.bpmcginley.workers.dev'

export const MAX_DESCRIPTION_CHARS = 1500

export function aiEndpoint(): string {
  try {
    const override = localStorage.getItem('fortuna:ai-endpoint')
    if (override !== null) return override.trim()
  } catch {
    /* storage unavailable */
  }
  return DEFAULT_AI_ENDPOINT
}

// Clamp + sanity-check whatever came back (AI or heuristic) so a wild parse can
// never produce a nonsensical plan.
function sanitize(p: ParsedSituation): ParsedSituation {
  const num = (v: number | null, lo: number, hi: number) =>
    v === null || Number.isNaN(v) ? null : Math.min(hi, Math.max(lo, Math.round(v)))
  return {
    ...emptySituation(),
    ...p,
    name: typeof p.name === 'string' ? p.name.slice(0, 40) : null,
    age: num(p.age, 14, 90),
    retireAge: num(p.retireAge, 30, 90),
    incomeAnnual: num(p.incomeAnnual, 0, 10_000_000),
    spendingAnnual: num(p.spendingAnnual, 0, 5_000_000),
    invested: num(p.invested, 0, 100_000_000),
    cash: num(p.cash, 0, 100_000_000),
    risk: p.risk === 'conservative' || p.risk === 'balanced' || p.risk === 'aggressive' ? p.risk : null,
    outlook: p.outlook === 'stable' || p.outlook === 'rising' || p.outlook === 'uncertain' ? p.outlook : null,
    planHome: typeof p.planHome === 'boolean' ? p.planHome : null,
    planKids: typeof p.planKids === 'boolean' ? p.planKids : null,
    events: Array.isArray(p.events)
      ? p.events
          .filter((e): e is ParsedEvent => !!e && typeof e.name === 'string' && Number.isFinite(e.age) && Number.isFinite(e.amount))
          .slice(0, 8)
          .map((e) => ({ name: e.name.slice(0, 60), age: Math.round(e.age), amount: Math.round(e.amount) }))
      : [],
    assumptions: Array.isArray(p.assumptions) ? p.assumptions.filter((a) => typeof a === 'string').slice(0, 12) : [],
  }
}

async function parseRemote(text: string, endpoint: string): Promise<ParsedSituation> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 10_000)
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, '')}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    })
    if (!res.ok) throw new Error(`parser service returned ${res.status}`)
    return (await res.json()) as ParsedSituation
  } finally {
    clearTimeout(timer)
  }
}

// Main entry: try the hosted AI parser when configured, fall back to the
// on-device heuristic on any failure. Never throws.
export async function textToPlan(text: string): Promise<ParseResult> {
  const clipped = text.slice(0, MAX_DESCRIPTION_CHARS)
  const endpoint = aiEndpoint()
  if (endpoint) {
    try {
      const parsed = sanitize(await parseRemote(clipped, endpoint))
      return { parsed, source: 'ai' }
    } catch {
      const parsed = sanitize(parseHeuristic(clipped))
      parsed.assumptions.unshift('AI parser was unreachable — used the on-device parser instead.')
      return { parsed, source: 'offline' }
    }
  }
  return { parsed: sanitize(parseHeuristic(clipped)), source: 'offline' }
}

// Merge a parse into wizard answers: only stated facts overwrite the defaults.
export function applyToWizard(parsed: ParsedSituation, base?: WizardAnswers): { answers: WizardAnswers; events: ParsedEvent[] } {
  const a: WizardAnswers = { ...(base ?? WIZARD_DEFAULTS) }
  if (parsed.name !== null) a.name = parsed.name
  if (parsed.age !== null) a.age = parsed.age
  if (parsed.retireAge !== null) a.retireAge = Math.max(parsed.retireAge, (parsed.age ?? a.age) + 1)
  if (parsed.incomeAnnual !== null) a.income = parsed.incomeAnnual
  if (parsed.spendingAnnual !== null) a.spending = parsed.spendingAnnual
  if (parsed.invested !== null) a.invested = parsed.invested
  if (parsed.cash !== null) a.cash = parsed.cash
  if (parsed.risk !== null) a.risk = parsed.risk
  if (parsed.outlook !== null) a.outlook = parsed.outlook
  if (parsed.planHome !== null) a.planHome = parsed.planHome
  if (parsed.planKids !== null) a.planKids = parsed.planKids
  return { answers: a, events: parsed.events }
}
