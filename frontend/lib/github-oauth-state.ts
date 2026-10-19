/**
 * GitHub "connect account" OAuth binding (SEC-007).
 *
 * The state row alone proved only that *someone* started the flow. An attacker
 * could start it, hand the GitHub authorize URL to a victim, and receive the
 * victim's token on the attacker's account. Now the callback requires all of:
 *   1. the state row exists, is < 10 minutes old and is consumed atomically;
 *   2. a signed, httpOnly cookie set by /start in *this browser* names the
 *      same state and user;
 *   3. the signed-in user is that same user;
 *   4. the PKCE verifier (S256) kept server-side with the state is sent to
 *      GitHub on the code exchange.
 */
import { createHash, randomBytes } from 'node:crypto'

export const GITHUB_STATE_COOKIE = 'cs_gh_oauth'
export const GITHUB_STATE_TTL_MS = 10 * 60_000

export function newPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url')
  return { verifier, challenge: pkceChallenge(verifier) }
}

export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

export type GithubBindingFailure =
  | 'invalid_state'
  | 'expired'
  | 'not_signed_in'
  | 'browser_mismatch'
  | 'user_mismatch'

/** Pure check of everything the callback must prove. */
export function checkGithubCallbackBinding(input: {
  state: string
  stateRow: Record<string, unknown> | null
  cookie: { state?: unknown; uid?: unknown } | null
  userId: string | null
  now?: number
}): { ok: true } | { ok: false; reason: GithubBindingFailure } {
  const { state, stateRow, cookie, userId } = input
  const now = input.now ?? Date.now()
  if (!stateRow || stateRow.state !== state) return { ok: false, reason: 'invalid_state' }
  const created = new Date(String(stateRow.created_at)).getTime()
  if (!Number.isFinite(created) || now - created > GITHUB_STATE_TTL_MS) return { ok: false, reason: 'expired' }
  if (!userId) return { ok: false, reason: 'not_signed_in' }
  if (!cookie || cookie.state !== state || cookie.uid !== stateRow.user_id) return { ok: false, reason: 'browser_mismatch' }
  if (String(stateRow.user_id) !== userId) return { ok: false, reason: 'user_mismatch' }
  return { ok: true }
}
