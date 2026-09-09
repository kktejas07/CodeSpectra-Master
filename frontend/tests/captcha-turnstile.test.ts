import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { verifyTurnstileToken, isCaptchaConfigured } from '@/lib/captcha/turnstile'

// ponytail: fail-closed when configured (bots must not pass), fail-open only
// when keys are absent (fresh deploys must not lock everyone out).
describe('turnstile verify', () => {
  const realFetch = global.fetch

  beforeEach(() => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    global.fetch = realFetch
  })

  it('passes on Cloudflare success', async () => {
    global.fetch = vi.fn().mockResolvedValue({ json: async () => ({ success: true }) }) as any
    const r = await verifyTurnstileToken('valid-token', '1.2.3.4')
    expect(r).toEqual({ ok: true })
  })

  it('fails closed on bad token', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ success: false, 'error-codes': ['invalid-input-response'] }),
    }) as any
    const r = await verifyTurnstileToken('bad-token-value-0123456789')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('invalid-input-response')
  })

  it('fails closed on missing token when configured', async () => {
    const r = await verifyTurnstileToken(null)
    expect(r).toEqual({ ok: false, error: 'missing-token' })
  })

  it('skips verification when no secret is configured', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '')
    const r = await verifyTurnstileToken(null)
    expect(r).toEqual({ ok: true, skipped: true })
    expect(await isCaptchaConfigured()).toBe(false)
  })

  it('fails closed when Cloudflare is unreachable', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as any
    const r = await verifyTurnstileToken('some-token')
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/^verify-error/)
  })
})
