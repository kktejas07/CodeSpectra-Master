import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const dynamic = 'force-dynamic'

export async function GET() {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const db = await getMongoDb()
  const attempts = db.collection('certification_attempts')

  const issued = await attempts
    .find({ passed: true })
    .sort({ issued_at: -1, submitted_at: -1 })
    .limit(500)
    .toArray()

  const data = issued.map((a: any) => ({
    id: a.id || String(a._id),
    user: {
      name: a.snapshot?.name || 'Unknown',
      email: a.snapshot?.email || '',
    },
    title: a.cert_snapshot?.title || 'Certificate',
    level: a.cert_snapshot?.level || 'Certified',
    source: a.cert_snapshot?.source || 'CodeSpectra',
    score: a.score,
    scoreLabel: a.score_label,
    template: a.template || 'classic',
    eventTitle: a.event_title || null,
    issuedBy: a.issued_by_email || null,
    issuedAt: a.issued_at || a.submitted_at || a.started_at,
    verifyToken: a.verify_token,
    certificationId: a.certification_id,
    revokedAt: a.revoked_at || null,
    revokedBy: a.revoked_by || null,
    revokeReason: a.revoke_reason || null,
  }))

  return NextResponse.json({ data })
}
