import { beforeEach, describe, expect, it, vi } from 'vitest'

// The worker keeps in-memory rate-limit state at module level, so import a
// fresh copy for every test.
async function freshWorker() {
  vi.resetModules()
  const mod = await import('../worker/src/index.js')
  return mod.default as { fetch: (req: Request, env: Record<string, string>) => Promise<Response> }
}

const ENV = { ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_BASE_URL: 'https://anthropic.mock' }

const GOOD_SITUATION = {
  name: null, age: 27, retireAge: 60, incomeAnnual: 82000, spendingAnnual: 32400,
  invested: 20000, cash: 8000, risk: null, outlook: null, planHome: true, planKids: null,
  events: [], assumptions: ['estimated spending from rent'],
}

function anthropicOk(situation: unknown = GOOD_SITUATION, stopReason = 'end_turn') {
  return new Response(
    JSON.stringify({ content: [{ type: 'text', text: JSON.stringify(situation) }], stop_reason: stopReason }),
    { status: 200 },
  )
}

function parseReq(body: unknown, origin = 'https://bpmcginley.github.io', ip = '1.2.3.4') {
  return new Request('https://fortuna-parse.test/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin, 'CF-Connecting-IP': ip },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('parse worker', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('happy path: forwards to Anthropic with the schema and returns the parsed JSON', async () => {
    const worker = await freshWorker()
    const upstream = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('https://anthropic.mock/v1/messages')
      const body = JSON.parse(init.body as string)
      expect(body.model).toBe('claude-haiku-4-5')
      expect(body.output_config.format.type).toBe('json_schema')
      expect(body.output_config.format.schema.properties.incomeAnnual).toBeDefined()
      expect(init.headers['x-api-key']).toBe('sk-test')
      return anthropicOk()
    })
    vi.stubGlobal('fetch', upstream)

    const res = await worker.fetch(parseReq({ text: "I'm 27, a nurse making $82k..." }), ENV)
    expect(res.status).toBe(200)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://bpmcginley.github.io')
    const data = await res.json()
    expect(data.age).toBe(27)
    expect(data.planHome).toBe(true)
  })

  it('answers CORS preflight', async () => {
    const worker = await freshWorker()
    const res = await worker.fetch(
      new Request('https://fortuna-parse.test/parse', {
        method: 'OPTIONS',
        headers: { Origin: 'http://tauri.localhost' },
      }),
      ENV,
    )
    expect(res.status).toBe(204)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://tauri.localhost')
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST')
  })

  it('does not echo unknown origins', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', vi.fn(async () => anthropicOk()))
    const res = await worker.fetch(parseReq({ text: 'hi' }, 'https://evil.example'), ENV)
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(null)
  })

  it('rejects oversized input without calling Anthropic', async () => {
    const worker = await freshWorker()
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    const res = await worker.fetch(parseReq({ text: 'x'.repeat(2000) }), ENV)
    expect(res.status).toBe(413)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('rejects bad bodies', async () => {
    const worker = await freshWorker()
    expect((await worker.fetch(parseReq('not json'), ENV)).status).toBe(400)
    expect((await worker.fetch(parseReq({ nope: 1 }), ENV)).status).toBe(400)
    expect((await worker.fetch(parseReq({ text: '   ' }), ENV)).status).toBe(400)
  })

  it('enforces the per-IP daily limit', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', vi.fn(async () => anthropicOk()))
    for (let i = 0; i < 20; i++) {
      expect((await worker.fetch(parseReq({ text: 'hello' }, undefined, '9.9.9.9'), ENV)).status).toBe(200)
    }
    const blocked = await worker.fetch(parseReq({ text: 'hello' }, undefined, '9.9.9.9'), ENV)
    expect(blocked.status).toBe(429)
    // a different IP still works
    expect((await worker.fetch(parseReq({ text: 'hello' }, undefined, '8.8.8.8'), ENV)).status).toBe(200)
  })

  it('maps upstream failures to 502 without leaking details', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ secret: 'account stuff' }), { status: 401 })))
    const res = await worker.fetch(parseReq({ text: 'hello' }), ENV)
    expect(res.status).toBe(502)
    const body = await res.text()
    expect(body).not.toContain('account stuff')
  })

  it('handles refusals and network errors', async () => {
    const worker = await freshWorker()
    vi.stubGlobal('fetch', vi.fn(async () => anthropicOk(GOOD_SITUATION, 'refusal')))
    expect((await worker.fetch(parseReq({ text: 'hello' }), ENV)).status).toBe(502)

    const worker2 = await freshWorker()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('down') }))
    expect((await worker2.fetch(parseReq({ text: 'hello' }), ENV)).status).toBe(502)
  })

  it('serves /health and 404s elsewhere', async () => {
    const worker = await freshWorker()
    const health = await worker.fetch(new Request('https://x/health'), ENV)
    expect(health.status).toBe(200)
    expect((await health.json()).ok).toBe(true)
    expect((await worker.fetch(new Request('https://x/other'), ENV)).status).toBe(404)
  })
})
