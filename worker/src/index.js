// Fortuna parse worker: turns a free-text life description into the
// ParsedSituation JSON that the app's wizard consumes. Holds the project's
// Anthropic API key so the feature is free for end users.
//
//   POST /parse   { text: string }  ->  ParsedSituation JSON
//   GET  /health                    ->  { ok: true }
//
// Protections: per-IP daily limit + global daily limit (in-memory per isolate —
// approximate by design; the hard backstop is the spend cap on the Anthropic
// console), input length cap, allow-listed CORS origins.

// Mirrors src/ai/schema.ts SITUATION_JSON_SCHEMA — keep the two in sync.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'name', 'age', 'retireAge', 'incomeAnnual', 'spendingAnnual', 'invested',
    'cash', 'risk', 'outlook', 'planHome', 'planKids', 'events', 'assumptions',
  ],
  properties: {
    name: { type: ['string', 'null'], description: "The person's first name, if stated" },
    age: { type: ['integer', 'null'], description: 'Current age in years' },
    retireAge: { type: ['integer', 'null'], description: 'Desired retirement age' },
    incomeAnnual: { type: ['number', 'null'], description: 'Gross annual income in dollars (convert monthly figures to annual)' },
    spendingAnnual: { type: ['number', 'null'], description: 'Total annual spending in dollars (convert monthly figures; if only rent is given, estimate total spending and note it in assumptions)' },
    invested: { type: ['number', 'null'], description: 'Total invested assets today: 401k, IRA, brokerage, stocks' },
    cash: { type: ['number', 'null'], description: 'Cash savings / emergency fund today' },
    risk: {
      anyOf: [{ type: 'string', enum: ['conservative', 'balanced', 'aggressive'] }, { type: 'null' }],
      description: 'Investing style if expressed',
    },
    outlook: {
      anyOf: [{ type: 'string', enum: ['stable', 'rising', 'uncertain'] }, { type: 'null' }],
      description: 'Career/income outlook if expressed',
    },
    planHome: { type: ['boolean', 'null'], description: 'Plans to buy a home' },
    planKids: { type: ['boolean', 'null'], description: 'Plans to have children' },
    events: {
      type: 'array',
      description: 'Dated one-off events with a dollar amount (negative = cost, positive = windfall). Only when both a timeframe and an amount are stated or clearly inferable.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'age', 'amount'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', description: 'Age at which the event happens' },
          amount: { type: 'number' },
        },
      },
    },
    assumptions: {
      type: 'array',
      items: { type: 'string' },
      description: 'One short line per interpretation or guess made. Never invent facts — put uncertainty here instead.',
    },
  },
}

const SYSTEM = `You extract personal-finance facts from a free-text life description into a fixed JSON schema for a financial-planning app.

Rules:
- Extract only what the text states or clearly implies. Use null for anything not mentioned. NEVER invent numbers.
- All money fields are US dollars. Convert monthly amounts to annual for incomeAnnual and spendingAnnual (note the conversion in assumptions).
- If only rent or partial expenses are given, estimate total annual spending from them and say exactly how in assumptions.
- "Buy a house in ~5 years for 60k down" style statements: set planHome true; if BOTH a timeframe and amount are inferable AND the person's age is known, also add an events entry (negative amount).
- assumptions: one short plain-English line per interpretation, guess, or notable gap (e.g. "no retirement age given"). Keep it under 8 lines.
- If the text is not a personal financial description at all, return all nulls and one assumption saying so.`

const CORS_ORIGINS = new Set([
  'https://bpmcginley.github.io', // web demo
  'http://tauri.localhost', // Tauri v2 webview on Windows
  'https://tauri.localhost',
  'http://localhost:5173', // browser dev mode
  'http://localhost:4173',
])

const PER_IP_DAILY = 20
const GLOBAL_DAILY = 500
const MAX_CHARS = 1500

// In-memory counters (per isolate; reset on eviction — approximate on purpose).
let day = ''
let globalCount = 0
let perIp = new Map()

function rollDay() {
  const today = new Date().toISOString().slice(0, 10)
  if (today !== day) {
    day = today
    globalCount = 0
    perIp = new Map()
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin')
  const h = {
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
  if (origin && CORS_ORIGINS.has(origin)) h['Access-Control-Allow-Origin'] = origin
  return h
}

function json(request, status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(request) },
  })
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) })
    }
    if (request.method === 'GET' && url.pathname === '/health') {
      return json(request, 200, { ok: true })
    }
    if (request.method !== 'POST' || url.pathname !== '/parse') {
      return json(request, 404, { error: 'not found' })
    }

    rollDay()
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
    const used = perIp.get(ip) ?? 0
    if (used >= PER_IP_DAILY || globalCount >= GLOBAL_DAILY) {
      return json(request, 429, { error: 'daily limit reached — the app will fall back to on-device parsing' })
    }

    let text
    try {
      const body = await request.json()
      text = body?.text
    } catch {
      return json(request, 400, { error: 'invalid JSON body' })
    }
    if (typeof text !== 'string' || !text.trim()) return json(request, 400, { error: 'missing text' })
    if (text.length > MAX_CHARS) return json(request, 413, { error: `text too long (max ${MAX_CHARS} chars)` })

    perIp.set(ip, used + 1)
    globalCount++

    const base = env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com'
    let upstream
    try {
      upstream = await fetch(`${base}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 1000,
          system: SYSTEM,
          output_config: { format: { type: 'json_schema', schema: SCHEMA } },
          messages: [{ role: 'user', content: text }],
        }),
      })
    } catch {
      return json(request, 502, { error: 'parser upstream unreachable' })
    }

    if (!upstream.ok) {
      console.error('upstream error', upstream.status, await upstream.clone().text())
      // Never leak upstream error bodies (may contain account details).
      return json(request, 502, { error: `parser upstream error (${upstream.status})` })
    }

    let data
    try {
      data = await upstream.json()
    } catch {
      return json(request, 502, { error: 'parser upstream returned invalid JSON' })
    }

    // Structured outputs guarantee the first text block is schema-valid JSON —
    // but a refusal or max_tokens stop may not be. Guard anyway.
    const block = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null
    if (!block || data.stop_reason === 'refusal') {
      return json(request, 502, { error: 'parser could not process this text' })
    }
    let parsed
    try {
      parsed = JSON.parse(block.text)
    } catch {
      return json(request, 502, { error: 'parser returned malformed output' })
    }

    return json(request, 200, parsed)
  },
}
