/**
 * GET /api/certifications/verify/[token]
 *
 * Public (no sign-in). Employers open this through the certificate's QR code
 * or share link. Returns only what a verifier needs: holder name, certificate
 * title, issue date, score band (when the certificate has a score), status
 * (valid / revoked) and issuer. No email, user id or exact answers.
 * Rate-limited per IP.
 */
import { NextResponse } from 'next/server'
import { certificationAttempts, type CertificationAttemptDoc } from '@/lib/db/certifications'
import { rateLimitRedis } from '@/lib/upstash-rate-limit'
import { clientLimiterKeyFromRequest } from '@/lib/in-memory-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/
const ISSUER = 'CodeSpectra'

/** Coarse band instead of the exact score. XP / "completed" certificates have no score band. */
function scoreBand(a: Pick<CertificationAttemptDoc, 'score' | 'score_label'>): string | null {
  const label = typeof a.score_label === 'string' ? a.score_label : ''
  if (/xp/i.test(label)) return label
  if (label && !label.includes('%')) return null
  const s = Number(a.score)
  if (!Number.isFinite(s)) return null
  if (s >= 90) return 'Distinction (90% and above)'
  if (s >= 75) return 'Merit (75–89%)'
  return 'Pass'
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const rl = await rateLimitRedis(`cert-verify:${clientLimiterKeyFromRequest(req, null)}`, 30, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { valid: false, reason: 'rate-limited', error: 'Too many lookups. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec) } },
    )
  }

  const { token } = await ctx.params
  if (!token || !TOKEN_RE.test(token)) {
    return NextResponse.json({ valid: false, reason: 'bad-token' }, { status: 400 })
  }

  try {
    const attempts = await certificationAttempts()
    const attempt = await attempts.findOne(
      { verify_token: token, passed: true },
      {
        projection: {
          _id: 0, snapshot: 1, cert_snapshot: 1, score: 1, score_label: 1,
          submitted_at: 1, template: 1, revoked_at: 1,
        },
      },
    )
    if (!attempt) {
      return NextResponse.json({ valid: false, reason: 'not-found' }, { status: 404 })
    }

    const revoked = !!attempt.revoked_at
    return NextResponse.json(
      {
        valid: !revoked,
        status: revoked ? 'revoked' : 'valid',
        reason: revoked ? 'revoked' : undefined,
        holder: { name: attempt.snapshot?.name || 'Certificate holder' },
        certification: {
          title: attempt.cert_snapshot?.title || 'CodeSpectra certificate',
          level: attempt.cert_snapshot?.level || '',
          source: attempt.cert_snapshot?.source || ISSUER,
        },
        issued_at: attempt.submitted_at || null,
        revoked_at: revoked ? attempt.revoked_at : null,
        score_band: scoreBand(attempt),
        issuer: ISSUER,
        template: attempt.template || 'classic',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (e) {
    console.error('[cert verify] error:', e)
    return NextResponse.json({ valid: false, reason: 'error', error: 'Could not check this certificate' }, { status: 500 })
  }
}
