/**
 * Cron endpoint auth: `Authorization: Bearer <CRON_SECRET>` only (a query
 * `?secret=` ends up in access logs and is no longer accepted), compared in
 * constant time. With no CRON_SECRET set, only non-production may run crons
 * unauthenticated (`allowDevWithoutSecret`, default true); production denies.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

/** Constant-time comparison of a presented bearer token with the secret. */
export function cronSecretMatches(expected: string, presented: string): boolean {
  if (!expected || !presented) return false
  // Hash both so lengths match and timingSafeEqual never throws or leaks length.
  const a = createHash('sha256').update(expected).digest()
  const b = createHash('sha256').update(presented).digest()
  return timingSafeEqual(a, b)
}

export function bearerToken(authorization: string | null | undefined): string {
  const m = /^Bearer\s+(.+)$/i.exec((authorization || '').trim())
  return m ? m[1].trim() : ''
}

export function decideCronAuth(input: {
  secret: string | undefined
  authorization: string | null | undefined
  nodeEnv: string | undefined
  allowDevWithoutSecret?: boolean
}): boolean {
  const expected = (input.secret || '').trim()
  if (!expected) return (input.allowDevWithoutSecret ?? true) && input.nodeEnv !== 'production'
  return cronSecretMatches(expected, bearerToken(input.authorization))
}

export function isCronAuthorized(req: Request, opts: { allowDevWithoutSecret?: boolean } = {}): boolean {
  return decideCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: req.headers.get('authorization'),
    nodeEnv: process.env.NODE_ENV,
    allowDevWithoutSecret: opts.allowDevWithoutSecret,
  })
}
