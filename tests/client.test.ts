import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyToWizard, textToPlan } from '../src/ai/client'
import { emptySituation } from '../src/ai/schema'
import { WIZARD_DEFAULTS } from '../src/state/profiles'

function fakeStorage(map: Record<string, string>) {
  ;(globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => (k in map ? map[k] : null),
    setItem: () => {},
    removeItem: () => {},
  }
}

const AI_RESPONSE = {
  ...emptySituation(),
  age: 31,
  incomeAnnual: 95_000,
  spendingAnnual: 48_000,
  risk: 'aggressive',
  events: [{ name: 'Wedding', age: 33, amount: -25_000 }],
  assumptions: ['no retirement age given'],
}

describe('textToPlan', () => {
  beforeEach(() => fakeStorage({ 'fortuna:ai-endpoint': 'https://parser.test' }))
  afterEach(() => vi.restoreAllMocks())

  it('uses the AI endpoint when reachable and sanitizes the result', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('https://parser.test/parse')
      return new Response(JSON.stringify(AI_RESPONSE), { status: 200 })
    }))
    const { parsed, source } = await textToPlan("I'm 31...")
    expect(source).toBe('ai')
    expect(parsed.age).toBe(31)
    expect(parsed.risk).toBe('aggressive')
    expect(parsed.events).toHaveLength(1)
  })

  it('falls back to on-device parsing when the endpoint fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })))
    const { parsed, source } = await textToPlan("I'm 31 and make $95k")
    expect(source).toBe('offline')
    expect(parsed.age).toBe(31)
    expect(parsed.incomeAnnual).toBe(95_000)
    expect(parsed.assumptions[0]).toContain('unreachable')
  })

  it('falls back when the endpoint throws (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('network down')
    }))
    const { source } = await textToPlan("I'm 31")
    expect(source).toBe('offline')
  })

  it('goes straight to on-device when endpoint override is empty', async () => {
    fakeStorage({ 'fortuna:ai-endpoint': '' })
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)
    const { source } = await textToPlan("I'm 31")
    expect(source).toBe('offline')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('sanitizes hostile AI output', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(
        JSON.stringify({
          age: 900, // out of range -> clamped to 90
          incomeAnnual: -5, // clamped to 0
          risk: 'yolo', // invalid enum -> null
          events: [{ name: 'x'.repeat(500), age: 40.7, amount: 1.5 }, null, 'junk'],
          assumptions: [1, 'ok'],
        }),
        { status: 200 },
      ),
    ))
    const { parsed } = await textToPlan('gibberish')
    expect(parsed.age).toBe(90)
    expect(parsed.incomeAnnual).toBe(0)
    expect(parsed.risk).toBe(null)
    expect(parsed.events).toHaveLength(1)
    expect(parsed.events[0].name.length).toBeLessThanOrEqual(60)
    expect(parsed.events[0].age).toBe(41)
    expect(parsed.assumptions).toEqual(['ok'])
  })
})

describe('applyToWizard', () => {
  it('only overwrites stated fields', () => {
    const parsed = { ...emptySituation(), age: 40, incomeAnnual: 110_000 }
    const { answers } = applyToWizard(parsed)
    expect(answers.age).toBe(40)
    expect(answers.income).toBe(110_000)
    expect(answers.spending).toBe(WIZARD_DEFAULTS.spending)
    expect(answers.retireAge).toBe(WIZARD_DEFAULTS.retireAge)
  })

  it('keeps retirement after current age', () => {
    const parsed = { ...emptySituation(), age: 60, retireAge: 55 }
    const { answers } = applyToWizard(parsed)
    expect(answers.retireAge).toBe(61)
  })

  it('passes events through', () => {
    const parsed = { ...emptySituation(), events: [{ name: 'Inheritance', age: 50, amount: 100_000 }] }
    const { events } = applyToWizard(parsed)
    expect(events).toHaveLength(1)
  })
})
