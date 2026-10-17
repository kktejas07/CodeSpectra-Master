/** Referral rules (pure). */

/** A referral code can only be applied by a new account, within this many days of signup. */
export const REFERRAL_WINDOW_DAYS = 7

/**
 * True when an account created at `createdAt` may still apply a referral code.
 * Unknown / unparsable creation dates are treated as not eligible (deny by default).
 */
export function isReferralEligible(createdAt: unknown, now: Date, windowDays = REFERRAL_WINDOW_DAYS): boolean {
  if (createdAt === null || createdAt === undefined || createdAt === '') return false
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(String(createdAt)).getTime()
  if (!Number.isFinite(t)) return false
  const age = now.getTime() - t
  return age >= -60_000 && age <= windowDays * 86_400_000
}

/** Normalise a user-typed code: trim, upper-case, only the code alphabet, max 16 chars. */
export function normaliseReferralCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const c = raw.trim().toUpperCase()
  return /^[A-Z0-9]{4,16}$/.test(c) ? c : null
}

/** "jane.doe@example.com" -> "j•••@example.com" (for showing referrers who joined). */
export function maskEmail(email: unknown): string {
  if (typeof email !== 'string' || !email.includes('@')) return ''
  const [local, domain] = email.split('@')
  return `${local.slice(0, 1)}•••@${domain}`
}
