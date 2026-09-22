/**
 * Provider-health helper tests.
 * The /api/admin/llm-health probe must bucket failures the way the
 * 2026-09-21 outage presented them (OpenAI 429 out-of-credits, Groq/Gemini
 * model 404s, OpenRouter 401, Zen upstream-unavailable), so the Health tab
 * tells the admin WHICH fix each red row needs.
 * Run: npx vitest run tests/llm-health.test.ts
 */
import { describe, it, expect } from 'vitest'
import { buildProbeHeaders, chainProbeTargets, classifyProbeError } from '@/lib/ai/provider-health'

describe('classifyProbeError', () => {
  it('buckets the exact 2026-09-21 outage signatures', () => {
    expect(classifyProbeError('You have no credits remaining', 429)).toBe('rate_limited')
    expect(classifyProbeError('insufficient_quota: you exceeded your current quota', 429)).toBe('rate_limited')
    expect(classifyProbeError('The model `llama-3.1-8b-instant` does not exist', 404)).toBe('dead_model')
    expect(classifyProbeError('models/gemini-2.0-flash is no longer available', 404)).toBe('dead_model')
    expect(classifyProbeError('Missing or invalid API key for OPENROUTER', 401)).toBe('bad_key')
    expect(classifyProbeError('Upstream request failed: Model is unavailable.', 400)).toBe('dead_model')
  })

  it('prefers rate_limited over auth when a 429 body mentions keys', () => {
    expect(classifyProbeError('Rate limit exceeded for api key, try again in 20s', 429)).toBe('rate_limited')
  })

  it('falls back to error for unknown failures', () => {
    expect(classifyProbeError('socket hang up')).toBe('error')
    expect(classifyProbeError('')).toBe('error')
  })
})

describe('chainProbeTargets', () => {
  it('emits one target per chain provider, each fully specified', () => {
    const targets = chainProbeTargets()
    const providers = targets.map((t) => t.provider)
    expect(new Set(providers).size).toBe(providers.length)
    expect(providers.length).toBeGreaterThanOrEqual(8)
    for (const t of targets) {
      expect(t.provider).toBeTruthy()
      expect(t.model).toBeTruthy()
      expect(t.secretKey).toMatch(/_api_key$/)
    }
  })
})

describe('buildProbeHeaders', () => {
  // 2026-09-22: probe showed 0/10 red with fresh keys because the key went
  // out ONLY as body api_key_override (dropped by CompleteReq) with no key
  // headers — backend ensure_key 500'd every provider. These pin the fix.
  it('carries the key in every header the backend resolve_key reads', () => {
    const h = buildProbeHeaders('sk-test-123', 'internal-secret')
    expect(h['x-api-key']).toBe('sk-test-123')
    expect(h['x-openai-api-key']).toBe('sk-test-123')
    expect(h['x-gemini-api-key']).toBe('sk-test-123')
    expect(h['x-anthropic-api-key']).toBe('sk-test-123')
    expect(h['x-internal-secret']).toBe('internal-secret')
    expect(h['Content-Type']).toBe('application/json')
  })

  it('omits the internal secret header when empty', () => {
    const h = buildProbeHeaders('sk-test-123', '')
    expect(h['x-api-key']).toBe('sk-test-123')
    expect('x-internal-secret' in h).toBe(false)
  })
})
