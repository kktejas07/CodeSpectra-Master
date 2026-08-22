/**
 * Username helpers — generate + ensure uniqueness for profile URLs.
 * Old users often have no username; new signups also never set one until profile edit.
 */

export function slugifyUsernameBase(raw: string): string {
  const s = (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24)
  return s || 'user'
}

/** first+last or email local-part → base, then numeric suffix */
export function generateUsernameCandidate(opts: {
  firstName?: string | null
  lastName?: string | null
  email?: string | null
  name?: string | null
  /** Override random suffix (e.g. when retrying after collision) */
  suffix?: number
}): string {
  const first = (opts.firstName || '').trim()
  const last = (opts.lastName || '').trim()
  const fromNames = slugifyUsernameBase(`${first}${last}`)
  const fromName = slugifyUsernameBase((opts.name || '').replace(/\s+/g, ''))
  const fromEmail = slugifyUsernameBase((opts.email || '').split('@')[0] || '')
  const base = (fromNames.length >= 3 ? fromNames : fromName.length >= 3 ? fromName : fromEmail) || 'user'
  const n = opts.suffix ?? Math.floor(1000 + Math.random() * 9000)
  return `${base}${n}`
}
