import { describe, expect, it } from 'vitest'
import { parseHeuristic } from '../src/ai/heuristic'

describe('parseHeuristic', () => {
  it('extracts the full kitchen-sink description', () => {
    const p = parseHeuristic(
      "I'm 27, a nurse making $82k, have $20k in my 401k and $8k saved, rent is $1,500/month, want to buy a house in 5 years and retire by 60.",
    )
    expect(p.age).toBe(27)
    expect(p.incomeAnnual).toBe(82_000)
    expect(p.invested).toBe(20_000)
    expect(p.cash).toBe(8_000)
    expect(p.retireAge).toBe(60)
    expect(p.planHome).toBe(true)
    // spending estimated from rent: 1500 * 12 * 1.8
    expect(p.spendingAnnual).toBe(32_400)
    expect(p.assumptions.some((a) => a.includes('rent'))).toBe(true)
  })

  it('converts monthly income to annual', () => {
    const p = parseHeuristic('I am 35 and earn 7k a month')
    expect(p.age).toBe(35)
    expect(p.incomeAnnual).toBe(84_000)
    expect(p.assumptions.some((a) => a.toLowerCase().includes('month'))).toBe(true)
  })

  it('handles comma amounts and explicit spending', () => {
    const p = parseHeuristic('My salary is $120,000 and we spend about $65,000 a year. Portfolio of $250,000.')
    expect(p.incomeAnnual).toBe(120_000)
    expect(p.spendingAnnual).toBe(65_000)
    expect(p.invested).toBe(250_000)
  })

  it('treats small unlabeled spending as monthly', () => {
    const p = parseHeuristic('I spend about 3k')
    expect(p.spendingAnnual).toBe(36_000)
  })

  it('detects risk style and outlook', () => {
    const agg = parseHeuristic("I'm 30 and pretty aggressive with investing, expecting a promotion soon")
    expect(agg.risk).toBe('aggressive')
    expect(agg.outlook).toBe('rising')
    const con = parseHeuristic('I prefer safe, conservative investments; I freelance so income varies')
    expect(con.risk).toBe('conservative')
    expect(con.outlook).toBe('uncertain')
  })

  it('detects kids plans including negation', () => {
    expect(parseHeuristic('we want kids in a few years').planKids).toBe(true)
    expect(parseHeuristic("we don't want kids").planKids).toBe(false)
    expect(parseHeuristic('I like dogs').planKids).toBe(null)
  })

  it('extracts a name', () => {
    expect(parseHeuristic('My name is Alex and I am 40').name).toBe('Alex')
  })

  it('returns nulls and a note on unusable text', () => {
    const p = parseHeuristic('what is the meaning of life?')
    expect(p.age).toBe(null)
    expect(p.incomeAnnual).toBe(null)
    expect(p.assumptions.length).toBeGreaterThan(0)
  })

  it('ignores implausible values', () => {
    expect(parseHeuristic("I'm 99 years old but say I'm 12").age).toBe(null) // 12 and 99 out of 14..90? 99 caught by first regex? "I'm 99" -> 99 > 90 rejected
  })

  it('does not double-count "$20k in my 401k" as cash', () => {
    const p = parseHeuristic('I have $20k in my 401k')
    expect(p.invested).toBe(20_000)
    expect(p.cash).toBe(null)
  })
})
