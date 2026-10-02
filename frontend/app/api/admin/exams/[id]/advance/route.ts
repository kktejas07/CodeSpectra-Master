import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { candidateInvites, newId, nowIso } from '@/lib/db/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST — Advance passed candidates to a next-round assessment.
 * Body: { targetExamId: string }
 *
 * Creates a pending candidate_invite per RELEASED+PASSED submission of this
 * exam. Idempotent: emails that already hold a pending/active invite for the
 * target exam are skipped and reported.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const { id: examId } = await params
  const body = await req.json().catch(() => ({})) as { targetExamId?: string }
  const targetExamId = String(body.targetExamId || '')
  if (!targetExamId) return NextResponse.json({ error: 'targetExamId is required' }, { status: 400 })
  if (targetExamId === examId) {
    return NextResponse.json({ error: 'Target must be a different assessment' }, { status: 400 })
  }

  try {
    const db = await getMongoDb()
    const owned = await requireTenantEntity(db, 'exams', examId, gate.user)
    if ('error' in owned) return NextResponse.json({ error: owned.error }, { status: owned.status })
    const targetOwned = await requireTenantEntity(db, 'exams', targetExamId, gate.user)
    if ('error' in targetOwned) return NextResponse.json({ error: 'Target assessment not found' }, { status: 404 })
    const targetTitle = (targetOwned.doc as Record<string, any>)?.title || 'next round'

    const passers = await db.collection('exam_submissions')
      .find({ exam_id: examId, score_released: true, passed: true })
      .project({ user_id: 1, email: 1 })
      .toArray()

    // Carry names forward from existing invites when available.
    const nameByEmail = new Map<string, string>()
    const knownInvites = await db.collection('candidate_invites').find({}).project({ email: 1, full_name: 1 }).toArray()
    for (const inv of knownInvites) {
      if (inv.email && inv.full_name && !nameByEmail.has(String(inv.email).toLowerCase())) {
        nameByEmail.set(String(inv.email).toLowerCase(), String(inv.full_name))
      }
    }

    const invitesCol = await candidateInvites()
    const targetUrl = `/assessment/${targetExamId}`
    let advanced = 0
    let skipped = 0
    const errors: string[] = []

    for (const sub of passers) {
      const email = String(sub.email || '').toLowerCase()
      if (!email) { skipped++; continue }
      try {
        const existing = await invitesCol.findOne({
          email,
          target_url: targetUrl,
          status: { $in: ['pending', 'active'] },
        })
        if (existing) { skipped++; continue }
        // Expire stale pending invites for same email + target (same rule as manual invites).
        await invitesCol.updateMany(
          { email, target_url: targetUrl, status: 'pending' },
          { $set: { status: 'expired', updated_at: nowIso() } }
        )
        const inviteToken = crypto.randomUUID()
        await invitesCol.insertOne({
          id: newId(),
          token: inviteToken,
          user_id: String(sub.user_id || ''),
          email,
          full_name: nameByEmail.get(email) || '',
          target_url: targetUrl,
          invited_by: gate.user.id,
          status: 'pending',
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          created_at: nowIso(),
          delivery_status: 'sending',
        })
        advanced++
      } catch (e: unknown) {
        skipped++
        errors.push(`${email}: ${e instanceof Error ? e.message : 'failed'}`)
      }
    }

    return NextResponse.json({
      advanced,
      skipped,
      passers: passers.length,
      target: { id: targetExamId, title: targetTitle },
      errors: errors.slice(0, 10),
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Advance failed'
    console.error('[CodeSpectra] advance POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
