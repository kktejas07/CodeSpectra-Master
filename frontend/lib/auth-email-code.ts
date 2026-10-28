/**
 * Pure rules for emailed one-time sign-in codes (face sign-in on a new
 * device). Codes are 6 digits, live 10 minutes, allow 5 attempts, and are
 * stored only as an HMAC keyed with a server secret (a leaked row can't be
 * brute-forced offline without the key).
 *
 * Tested in tests/face-sign-in.test.ts; I/O in lib/trusted-devices.ts.
 */
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

export const EMAIL_CODE_TTL_MS = 10 * 60_000
export const EMAIL_CODE_MAX_ATTEMPTS = 5
export const EMAIL_CODE_LENGTH = 6

export function generateEmailCode(): string {
  return String(randomInt(0, 10 ** EMAIL_CODE_LENGTH)).padStart(EMAIL_CODE_LENGTH, '0')
}

/** HMAC-SHA256(key, challengeId:code) as hex. The challenge id salts each code. */
export function hashEmailCode(code: string, key: Uint8Array | string, challengeId: string): string {
  return createHmac('sha256', key).update(`${challengeId}:${code}`).digest('hex')
}

export interface EmailCodeRecord {
  code_hash: string
  expires_at: Date | string
  /** Attempts made BEFORE this one. */
  attempts: number
  consumed_at?: Date | string | null
}

export type EmailCodeCheck =
  | { ok: true }
  | { ok: false; reason: 'missing' | 'used' | 'expired' | 'too_many_attempts' | 'invalid' }

export function normalizeEmailCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/\s+/g, '')
  return new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`).test(digits) ? digits : null
}

/**
 * Check one attempt against a stored code. `record.attempts` is the count
 * before this attempt (the caller increments it atomically and passes the
 * pre-increment document), so a 6th try is refused even if correct.
 */
export function checkEmailCode(
  record: EmailCodeRecord | null | undefined,
  code: unknown,
  key: Uint8Array | string,
  challengeId: string,
  now: Date = new Date(),
): EmailCodeCheck {
  if (!record) return { ok: false, reason: 'missing' }
  if (record.consumed_at) return { ok: false, reason: 'used' }
  const exp = new Date(record.expires_at).getTime()
  if (!Number.isFinite(exp) || exp <= now.getTime()) return { ok: false, reason: 'expired' }
  if ((record.attempts ?? 0) >= EMAIL_CODE_MAX_ATTEMPTS) return { ok: false, reason: 'too_many_attempts' }
  const normalized = normalizeEmailCode(code)
  if (!normalized) return { ok: false, reason: 'invalid' }
  const a = Buffer.from(hashEmailCode(normalized, key, challengeId), 'hex')
  const b = Buffer.from(String(record.code_hash || ''), 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'invalid' }
  return { ok: true }
}
