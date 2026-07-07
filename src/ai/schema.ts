// The shared contract between every text-to-plan engine (on-device heuristic,
// hosted AI parser) and the wizard that consumes the result. All money is in
// TODAY's dollars, all *Annual fields are per-year.

export interface ParsedEvent {
  name: string
  age: number
  amount: number // negative = cost, positive = windfall
}

export interface ParsedSituation {
  name: string | null
  age: number | null
  retireAge: number | null
  incomeAnnual: number | null
  spendingAnnual: number | null
  invested: number | null
  cash: number | null
  risk: 'conservative' | 'balanced' | 'aggressive' | null
  outlook: 'stable' | 'rising' | 'uncertain' | null
  planHome: boolean | null
  planKids: boolean | null
  events: ParsedEvent[]
  // Human-readable notes about every interpretation/guess made while parsing.
  assumptions: string[]
}

export interface ParseResult {
  parsed: ParsedSituation
  source: 'ai' | 'offline'
}

export function emptySituation(): ParsedSituation {
  return {
    name: null,
    age: null,
    retireAge: null,
    incomeAnnual: null,
    spendingAnnual: null,
    invested: null,
    cash: null,
    risk: null,
    outlook: null,
    planHome: null,
    planKids: null,
    events: [],
    assumptions: [],
  }
}

// JSON schema enforced on the model via structured outputs — the API guarantees
// the response validates, so the client never needs retry-on-bad-JSON logic.
// Mirrors ParsedSituation exactly. (Structured outputs require every object to
// set additionalProperties:false and list all properties in `required`;
// optionality is expressed with nullable types.)
export const SITUATION_JSON_SCHEMA = {
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
    spendingAnnual: { type: ['number', 'null'], description: 'Total annual spending in dollars (convert monthly figures; if only rent is given, use it as a floor and note that in assumptions)' },
    invested: { type: ['number', 'null'], description: 'Total invested assets today: 401k, IRA, brokerage, stocks' },
    cash: { type: ['number', 'null'], description: 'Cash savings / emergency fund today' },
    risk: { type: ['string', 'null'], enum: ['conservative', 'balanced', 'aggressive', null], description: 'Investing style if expressed' },
    outlook: { type: ['string', 'null'], enum: ['stable', 'rising', 'uncertain', null], description: 'Career/income outlook if expressed' },
    planHome: { type: ['boolean', 'null'], description: 'Plans to buy a home' },
    planKids: { type: ['boolean', 'null'], description: 'Plans to have children' },
    events: {
      type: 'array',
      description: 'Dated one-off events with a dollar amount (negative = cost like a wedding or house down payment, positive = windfall like an inheritance). Only when both an age/timeframe and an amount are stated or clearly inferable.',
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
      description: 'One short line per interpretation or guess made (e.g. "treated $7k/mo income as $84k/yr", "no retirement age given"). Never invent facts — put uncertainty here instead.',
    },
  },
} as const
