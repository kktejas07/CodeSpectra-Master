/**
 * Read the current session (GET /api/auth/session) and tell a real "signed
 * out" apart from a transient failure. Only a 401, or a 200 with no user,
 * means signed out. A 429 (rate limit), a 5xx or a network error is retried a
 * few times with a short backoff and, if it still fails, reported as
 * 'unknown', so callers keep the current state instead of sending a
 * signed-in person to the sign-in page.
 */
export type SessionUser = Record<string, unknown> & { uid?: string }
export type SessionResult =
  | { status: 'user'; user: SessionUser }
  | { status: 'none' }
  | { status: 'unknown' }

export async function fetchSessionState(opts: { retries?: number; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> } = {}): Promise<SessionResult> {
  const retries = opts.retries ?? 3
  const f = opts.fetchImpl ?? fetch
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  for (let attempt = 0; ; attempt++) {
    let wait = 500 * 2 ** attempt
    try {
      const res = await f('/api/auth/session', { credentials: 'include' })
      if (res.status === 401) return { status: 'none' }
      if (res.ok) {
        const data = await res.json().catch(() => null) as { user?: SessionUser } | null
        return data?.user ? { status: 'user', user: data.user } : { status: 'none' }
      }
      // 429 / 5xx — transient. Honour Retry-After (capped) when present.
      const ra = Number(res.headers.get('retry-after'))
      if (Number.isFinite(ra) && ra > 0) wait = Math.min(ra * 1000, 5000)
    } catch { /* network — transient */ }
    if (attempt >= retries) return { status: 'unknown' }
    await sleep(wait)
  }
}
