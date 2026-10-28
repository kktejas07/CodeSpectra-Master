/**
 * Fix for the flaky CTF hash test in contests.test.ts.
 *
 * Root cause: hashFlag returns a 64-char lowercase hex digest. The original
 * assertion `expect(h).not.toContain('abc')` is probabilistically wrong —
 * any hex string can contain 'abc' as a substring by chance (as observed:
 * 2d9b68afc399cb9b85594eb8c3bca5abc899...).
 *
 * Correct invariant: the output is a 64-char hex string that does NOT
 * contain the raw plaintext flag as a readable substring, which means
 * the flag value itself (without 'flag{...}' wrapper) must not appear as
 * a readable word — but we should not test hex collision avoidance.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/mongodb', () => ({ getMongoDb: vi.fn(async () => { throw new Error('no db in unit tests') }) }))

import { hashFlag, verifyFlag, newSalt } from '@/lib/contests/scoring/ctf'

describe('CTF hash — corrected assertions', () => {
  it('hashFlag returns a 64-char hex string', () => {
    const salt = newSalt()
    const h = hashFlag(salt, ' flag{abc} ')
    expect(h).toMatch(/^[0-9a-f]{64}$/)
  })

  it('hashFlag output is not the raw plaintext flag', () => {
    const salt = newSalt()
    const flag = 'supersecretflagvalue'
    const h = hashFlag(salt, `flag{${flag}}`)
    // The hash must NOT equal the plaintext
    expect(h).not.toBe(flag)
    expect(h).not.toBe(`flag{${flag}}`)
    // It must be a valid 64-char hex — actual hex chars a-f can appear coincidentally
    expect(h.length).toBe(64)
  })

  it('verifyFlag returns true for the exact flag (after trim)', () => {
    const salt = newSalt()
    const h = hashFlag(salt, ' flag{abc} ')
    expect(verifyFlag(salt, 'flag{abc}', h)).toBe(true)
  })

  it('verifyFlag returns false for a different flag', () => {
    const salt = newSalt()
    const h = hashFlag(salt, 'flag{abc}')
    expect(verifyFlag(salt, 'flag{abd}', h)).toBe(false)
  })

  it('verifyFlag returns false with a different salt', () => {
    const salt1 = newSalt()
    const salt2 = newSalt()
    const h = hashFlag(salt1, 'flag{abc}')
    expect(verifyFlag(salt2, 'flag{abc}', h)).toBe(false)
  })

  it('verifyFlag returns false for a malformed stored hash', () => {
    const salt = newSalt()
    expect(verifyFlag(salt, 'flag{abc}', 'not-a-hash')).toBe(false)
    expect(verifyFlag(salt, 'flag{abc}', '')).toBe(false)
    expect(verifyFlag(salt, 'flag{abc}', 'ZZZZZZ')).toBe(false)
  })

  it('hashFlag trims surrounding whitespace before hashing', () => {
    const salt = newSalt()
    const h1 = hashFlag(salt, '  flag{abc}  ')
    const h2 = hashFlag(salt, 'flag{abc}')
    expect(h1).toBe(h2)
  })

  it('different flags produce different hashes', () => {
    const salt = newSalt()
    const h1 = hashFlag(salt, 'flag{abc}')
    const h2 = hashFlag(salt, 'flag{xyz}')
    expect(h1).not.toBe(h2)
  })

  it('same flag with different salts produces different hashes', () => {
    const h1 = hashFlag(newSalt(), 'flag{abc}')
    const h2 = hashFlag(newSalt(), 'flag{abc}')
    // Extremely unlikely (probability 1/2^256) these collide
    expect(h1).not.toBe(h2)
  })
})
