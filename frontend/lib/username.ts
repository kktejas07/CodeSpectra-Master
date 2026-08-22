/**
 * Username helpers — LinkedIn/Google style:
 * prefer `firstnamelastname`; only append a number when that handle is taken.
 */

export function slugifyUsernameBase(raw: string): string {
  const s = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  return s || 'user'
}

/** True for placeholder handles like user1168 (auto-assigned before a real name existed). */
export function isGenericUsername(username: string | null | undefined): boolean {
  return /^user\d{2,}$/i.test(String(username || '').trim())
}

/** Build the name/email slug only (no digits). */
export function usernameBaseFromIdentity(opts: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  name?: string | null
}): string {
  const first = (opts.firstName || '').trim()
  const last = (opts.lastName || '').trim()
  const fromNames = slugifyUsernameBase(`${first}${last}`)
  const fromName = slugifyUsernameBase((opts.name || '').replace(/\s+/g, ''))
  const fromEmail = slugifyUsernameBase((opts.email || '').split('@')[0] || '')
  return (fromNames.length >= 3 ? fromNames : fromName.length >= 3 ? fromName : fromEmail) || 'user'
}

/**
 * Candidate username. No suffix → plain name (e.g. `devendervutukuru`).
 * With suffix → `devendervutukuru2` (LinkedIn-style collision).
 * If we only have a weak base (`user`), always attach digits.
 */
export function generateUsernameCandidate(opts: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  name?: string | null
  /** Collision counter: omit for bare name; 2 → name2, 3 → name3, … */
  suffix?: number
}): string {
  const base = usernameBaseFromIdentity(opts)
  if (opts.suffix != null && opts.suffix > 1) return `${base}${opts.suffix}`
  if (base === 'user') {
    const n = opts.suffix && opts.suffix > 1 ? opts.suffix : Math.floor(1000 + Math.random() * 9000)
    return `user${n}`
  }
  return base
}
