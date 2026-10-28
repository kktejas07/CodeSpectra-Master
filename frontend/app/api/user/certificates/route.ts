import { NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { certificationAttempts } from '@/lib/db/certifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** GET /api/user/certificates — the signed-in user's own earned (passed, not revoked) certificates. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })
  try {
    const col = await certificationAttempts()
    const rows = await col
      .find(
        { user_id: user.id, passed: true, $or: [{ revoked_at: null }, { revoked_at: { $exists: false } }] },
        { projection: { _id: 0, id: 1, verify_token: 1, submitted_at: 1, started_at: 1, cert_snapshot: 1, score_label: 1, score: 1, event_title: 1 } },
      )
      .sort({ submitted_at: -1 })
      .limit(200)
      .toArray()
    const certificates = rows.map((r) => ({
      id: r.id,
      title: r.cert_snapshot?.title || 'Certificate',
      level: r.cert_snapshot?.level || '',
      source: r.cert_snapshot?.source || '',
      event_title: r.event_title ?? null,
      score_label: r.score_label ?? null,
      issued_at: r.submitted_at || r.started_at || null,
      verify_url: `/cert/verify/${encodeURIComponent(r.verify_token)}`,
    }))
    return NextResponse.json({ certificates })
  } catch (e) {
    console.error('[user/certificates] GET:', e)
    return NextResponse.json({ error: 'Could not load certificates' }, { status: 500 })
  }
}
