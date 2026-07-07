# Fortuna parse worker

A tiny Cloudflare Worker that powers the "describe your situation" AI import in
Fortuna's wizard. It holds the project's Anthropic API key so the feature is
**free for end users**; the app falls back to on-device parsing whenever this
service is unreachable or rate-limited, so it can never break the app.

- `POST /parse` `{ "text": "I'm 27, make $85k..." }` → `ParsedSituation` JSON
  (schema mirrors `src/ai/schema.ts` — keep them in sync)
- `GET /health` → `{ ok: true }`
- Model: `claude-haiku-4-5` with structured outputs (~0.3¢ per parse)
- Protections: 20 parses/IP/day, 500/day globally (in-memory, approximate),
  1,500-char input cap, allow-listed CORS origins, upstream errors never leaked

## Deploy (one time, ~3 minutes)

```bash
cd worker
npx wrangler login                          # opens browser → Cloudflare account (free)
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key from console.anthropic.com
npx wrangler deploy                         # prints the live URL
```

The app expects `https://fortuna-parse.<your-subdomain>.workers.dev`. If your
workers.dev subdomain differs from the default baked into
`src/ai/client.ts` (`DEFAULT_AI_ENDPOINT`), update that constant and rebuild —
or test instantly without a rebuild by setting
`localStorage['fortuna:ai-endpoint'] = '<url>'` in the app's devtools.

**Cost control:** set a monthly spend limit at console.anthropic.com → Billing.
If the limit is hit the worker starts failing and every user transparently
falls back to on-device parsing — nothing breaks.

## Local test

```bash
npx wrangler dev --local   # http://localhost:8787 (needs no Cloudflare account)
```
