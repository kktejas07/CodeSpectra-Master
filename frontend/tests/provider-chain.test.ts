/**
 * Provider chain anti-rot guard.
 * The 2026-09-21 prod outage was every chain entry dying at once
 * (groq llama-3.1-8b-instant 404, gemini-2.0-flash 404, Zen
 * deepseek-v4-flash-free upstream-unavailable). This test fails if a
 * known-dead model ID is ever reintroduced into either LLM chain, and
 * enforces rotation breadth so one provider outage can't sink a job.
 * Run: npx vitest run tests/provider-chain.test.ts
 */
import { describe, it, expect } from 'vitest'
import { PROVIDER_FALLBACK_CHAIN } from '@/lib/ai/provider-fallback'
import { PROVIDER_MODELS } from '@/lib/courses/lesson-video'
import { LLM_CONFIG_DEFAULTS } from '@/lib/llm-config'

// IDs proven dead in prod (2026-09-21 job logs) or retired by vendors.
// If a vendor resurrects one, remove it here — not before.
const KNOWN_DEAD = [
  'llama-3.1-8b-instant',
  'gemini-2.0-flash',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'deepseek-v4-flash-free',
]

// Providers with backend-default base URLs (no explicit endpoint needed).
// All other providers fall through to _stream_openai which defaults to
// api.openai.com — so they MUST carry an explicit endpoint.
const BACKEND_DEFAULTED = new Set([
  'gemini', 'anthropic', 'opencode', 'openrouter', 'groq', 'nvidia', 'openai',
])

describe('provider fallback chain', () => {
  it('contains no known-dead model IDs', () => {
    for (const e of PROVIDER_FALLBACK_CHAIN) {
      for (const dead of KNOWN_DEAD) {
        expect(e.model).not.toContain(dead)
      }
    }
  })

  it('every entry names a provider and model', () => {
    expect(PROVIDER_FALLBACK_CHAIN.length).toBeGreaterThan(0)
    for (const e of PROVIDER_FALLBACK_CHAIN) {
      expect(e.provider).toBeTruthy()
      expect(e.model).toBeTruthy()
      expect(e.secretKey).toMatch(/_api_key$/)
    }
  })

  it('non-defaulted providers carry an explicit endpoint', () => {
    for (const e of PROVIDER_FALLBACK_CHAIN) {
      if (!BACKEND_DEFAULTED.has(e.provider)) {
        expect(e.endpoint, `${e.provider}/${e.model} needs an explicit endpoint`).toMatch(/^https:\/\//)
      }
    }
  })

  it('spans enough providers to survive single-provider outages', () => {
    const providers = new Set(PROVIDER_FALLBACK_CHAIN.map(e => e.provider))
    expect(providers.size).toBeGreaterThanOrEqual(8)
  })

  it('cerebras never uses llama-3.3-70b (retired by vendor; groq/openrouter variants with longer IDs are unaffected)', () => {
    for (const e of PROVIDER_FALLBACK_CHAIN) {
      if (e.provider === 'cerebras') {
        expect(e.model).not.toBe('llama-3.3-70b')
      }
    }
  })
})

describe('course worker chain', () => {
  it('contains no known-dead model IDs', () => {
    for (const e of PROVIDER_MODELS) {
      for (const dead of KNOWN_DEAD) {
        expect(e.model).not.toContain(dead)
      }
    }
  })

  it('spans enough providers to survive single-provider outages', () => {
    const providers = new Set(PROVIDER_MODELS.map(e => e.provider))
    expect(providers.size).toBeGreaterThanOrEqual(8)
  })

  it('non-defaulted providers carry an explicit endpoint', () => {
    for (const e of PROVIDER_MODELS) {
      if (!BACKEND_DEFAULTED.has(e.provider)) {
        expect((e as { endpoint?: string }).endpoint, `${e.provider}/${e.model} needs an explicit endpoint`).toMatch(/^https:\/\//)
      }
    }
  })
})

describe('llm defaults', () => {
  it('default model is not a known-dead ID', () => {
    for (const dead of KNOWN_DEAD) {
      expect(LLM_CONFIG_DEFAULTS.model).not.toContain(dead)
    }
  })
})

describe('custom gateway registry', () => {
  it('custom provider exists, bearer-authed, with no baked-in endpoint', async () => {
    const { LLM_PROVIDERS } = await import('@/lib/llm-config')
    const custom = LLM_PROVIDERS.find((p) => p.id === 'custom')
    expect(custom).toBeTruthy()
    expect(custom!.authType).toBe('bearer')
    // Endpoint must come from saved settings — a static default here would
    // silently route traffic somewhere the admin never chose.
    expect(custom!.endpoint).toBe('')
  })
})

describe('provider error classification', () => {
  it('treats credit/billing exhaustion as DEAD (skip, no wait), not a rate limit', async () => {
    const { isDeadProvider, isRateLimitError } = await import('@/lib/ai/provider-fallback')
    for (const msg of ['insufficient credits', '402 Payment Required', 'exceeded quota', 'billing hard limit reached']) {
      expect(isRateLimitError(msg).isRateLimit, msg).toBe(false)
      expect(isDeadProvider(msg), msg).toBe(true)
    }
  })

  it('still classifies genuine rate limits as retryable', async () => {
    const { isRateLimitError, isDeadProvider } = await import('@/lib/ai/provider-fallback')
    expect(isRateLimitError('429 Too Many Requests').isRateLimit).toBe(true)
    expect(isRateLimitError('rate limit exceeded, try again in 20s').isRateLimit).toBe(true)
    expect(isDeadProvider('429 Too Many Requests')).toBe(false)
  })
})
