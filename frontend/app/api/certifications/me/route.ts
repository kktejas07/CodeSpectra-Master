/**
 * GET /api/certifications/me
 *
 * Returns the signed-in user's attempt history grouped by certification.
 * Used by the dashboard to flag "earned" vs "in progress" badges.
 */
import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/api-auth'
import {
  certifications,
  certificationAttempts,
  publicCertView,
} from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const attempts = await certificationAttempts()
  const rows = await attempts
    .find({ user_id: user.id })
    .sort({ started_at: -1 })
    .toArray()

  const certIds = Array.from(new Set(rows.map((r) => r.certification_id)))
  const certs = await certifications()
  const certDocs = await certs.find({ id: { $in: certIds } }).toArray()
  const certMap = new Map(certDocs.map((c) => [c.id, c]))

  const items = rows.map((r) => {
    const c = certMap.get(r.certification_id)
    return {
      attempt_id: r.id,
      certification: c ? publicCertView(c) : null,
      score: r.score,
      passed: r.passed,
      started_at: r.started_at,
      submitted_at: r.submitted_at,
      verify_token: r.passed ? r.verify_token : null,
    }
  })

  return NextResponse.json({
    items,
    earned_count: rows.filter((r) => r.passed).length,
    attempt_count: rows.length,
  })
}
