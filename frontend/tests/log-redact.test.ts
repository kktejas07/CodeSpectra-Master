import { describe, it, expect, vi } from 'vitest'
import { installConsoleRedaction, isSensitiveKey, redactLogValue, redactString } from '@/lib/log-redact'

// Secret-looking values are assembled at runtime so scanners never see a literal.
const JWT = ['eyJ' + 'h'.repeat(20), 'p'.repeat(24), 's'.repeat(24)].join('.')
const OPENAI = 'sk-' + 'A1b2'.repeat(8)
const STRIPE = ['sk', 'live', 'Q'.repeat(24)].join('_')
const GOOGLE = 'AIza' + 'k'.repeat(35)
const PW = 'Hunter2' + 'x'.repeat(9)

describe('redactString', () => {
  it('masks tokens, provider keys and credentialed URLs', () => {
    const line = `auth Bearer ${JWT} key ${OPENAI} stripe ${STRIPE} google ${GOOGLE} db mongodb+srv://app:${PW}@cluster0.example.net/x`
    const out = redactString(line)
    for (const s of [JWT, OPENAI, STRIPE, GOOGLE, PW]) expect(out).not.toContain(s)
    expect(out).toContain('mongodb+srv://app:[REDACTED]@cluster0.example.net')
  })

  it('masks PEM private keys, ?token= params and KEY=value pairs', () => {
    const pem = `-----BEGIN PRIVATE KEY-----\n${'M'.repeat(80)}\n-----END PRIVATE KEY-----`
    expect(redactString(pem)).toBe('[REDACTED PRIVATE KEY]')
    expect(redactString('/api/x?token=abcdef123456&page=2')).toBe('/api/x?token=[REDACTED]&page=2')
    expect(redactString(`INTERNAL_BACKEND_SECRET=${PW}`)).toBe('INTERNAL_BACKEND_SECRET=[REDACTED]')
  })

  it('leaves ordinary log text alone', () => {
    const msg = '[exams] user u_42 submitted attempt 3 in 1200ms (score 7/10)'
    expect(redactString(msg)).toBe(msg)
  })
})

describe('redactLogValue', () => {
  it('redacts sensitive keys deeply and keeps safe ones', () => {
    const out = redactLogValue({
      email: 'a@b.co',
      password: PW,
      headers: { Authorization: `Bearer ${JWT}`, 'x-internal-secret': PW, accept: 'json' },
      nested: [{ api_key: OPENAI, max_tokens: 400, idempotencyKey: 'order-1' }],
    }) as Record<string, any>
    expect(out.email).toBe('a@b.co')
    expect(out.password).toBe('[REDACTED]')
    expect(out.headers.Authorization).toBe('[REDACTED]')
    expect(out.headers['x-internal-secret']).toBe('[REDACTED]')
    expect(out.headers.accept).toBe('json')
    expect(out.nested[0].api_key).toBe('[REDACTED]')
    expect(out.nested[0].max_tokens).toBe(400)
  })

  it('scrubs Error messages and stacks, keeps the error type', () => {
    const e = new TypeError(`connect failed for mongodb://root:${PW}@db:27017`)
    const out = redactLogValue(e) as Error
    expect(out).toBeInstanceOf(Error)
    expect(out.name).toBe('TypeError')
    expect(out.message).not.toContain(PW)
    expect(String(out.stack)).not.toContain(PW)
  })

  it('handles cycles and never throws', () => {
    const a: Record<string, unknown> = { token: 'abc' }
    a.self = a
    const out = redactLogValue(a) as Record<string, unknown>
    expect(out.token).toBe('[REDACTED]')
    expect(out.self).toBe('[Circular]')
  })

  it('classifies keys', () => {
    expect(isSensitiveKey('refreshToken')).toBe(true)
    expect(isSensitiveKey('SESSION_SECRET')).toBe(true)
    expect(isSensitiveKey('totp')).toBe(true)
    expect(isSensitiveKey('total_tokens')).toBe(false)
    expect(isSensitiveKey('siteKey')).toBe(false)
    expect(isSensitiveKey('footprint')).toBe(false)
  })
})

describe('installConsoleRedaction', () => {
  it('wraps console methods once', () => {
    const calls: unknown[][] = []
    const fake = { log: (...a: unknown[]) => calls.push(a), info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => calls.push(a), debug: vi.fn(), trace: vi.fn() } as unknown as Console
    installConsoleRedaction(fake)
    installConsoleRedaction(fake)
    fake.error('[x] failed', { password: PW }, `Bearer ${JWT}`)
    expect(JSON.stringify(calls)).not.toContain(PW)
    expect(JSON.stringify(calls)).not.toContain(JWT)
    expect(calls).toHaveLength(1)
  })
})
