/**
 * GET /api/certifications/verify/[token]
 *
 * Public endpoint. Employers can hit this with a token from the certificate
 * QR code / shareable URL to verify a candidate's claim. Returns minimal
 * non-PII data (name + cert title + submitted_at).
 */
import { NextResponse } from 'next/server'
import { certificationAttempts } from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!token || token.length < 8) {
    return NextResponse.json({ valid: false, reason: 'bad-token' }, { status: 400 })
  }
  const attempts = await certificationAttempts()
  const attempt = await attempts.findOne({ verify_token: token, passed: true })
  if (!attempt) {
    return NextResponse.json({ valid: false, reason: 'not-found' }, { status: 404 })
  }
  return NextResponse.json({
    valid: true,
    candidate: { name: attempt.snapshot.name || 'Anonymous' },
    certification: attempt.cert_snapshot,
    score: attempt.score,
    issued_at: attempt.submitted_at,
  })
}
