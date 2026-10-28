import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireTenantEntity } from '@/lib/api-auth'
import { getMongoDb } from '@/lib/mongodb'
import { candidateInvites, newId, nowIso } from '@/lib/db/admin'
import { sendEmail } from '@/lib/send-email'
import { emailLongDate, emailTemplatesFor } from '@/lib/email-templates'
import { localeForEmail } from '@/lib/i18n/recipient'

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
    if (!(targetOwned.doc as Record<string, unknown>).published) {
      return NextResponse.json({ error: 'Publish the next-round assessment before advancing candidates.' }, { status: 409 })
    }

    const passers = await db.collection('exam_submissions')
      .find({ exam_id: examId, score_released: true, passed: true })
      .project({ user_id: 1, email: 1 })
      .toArray()

    // Carry names forward from existing invites when available.
    const nameByEmail = new Map<string, string>()
    const passerEmails = [...new Set(passers.map((p) => String(p.email || '').toLowerCase()).filter(Boolean))]
    const knownInvites = passerEmails.length
      ? await db.collection('candidate_invites').find({ email: { $in: passerEmails } }).project({ email: 1, full_name: 1 }).toArray()
      : []
    for (const inv of knownInvites) {
      if (inv.email && inv.full_name && !nameByEmail.has(String(inv.email).toLowerCase())) {
        nameByEmail.set(String(inv.email).toLowerCase(), String(inv.full_name))
      }
    }

    const invitesCol = await candidateInvites()
    const targetUrl = `/assessment/${targetExamId}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    let advanced = 0
    let emailed = 0
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
        const inviteId = newId()
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        const fullName = nameByEmail.get(email) || ''
        await invitesCol.insertOne({
          id: inviteId,
          token: inviteToken,
          user_id: String(sub.user_id || ''),
          email,
          full_name: fullName,
          target_url: targetUrl,
          exam_id: targetExamId,
          invited_by: gate.user.id,
          status: 'pending',
          expires_at: expiresAt.toISOString(),
          created_at: nowIso(),
          delivery_status: 'sending',
        } as never)
        advanced++

        // Tell the candidate (same email as a manual invite) and record the outcome.
        const locale = await localeForEmail(email)
        const template = emailTemplatesFor(locale).assessmentInvite({
          candidateName: fullName || email,
          examTitle: targetTitle,
          inviteUrl: `${appUrl}/assessment/invite/${inviteToken}`,
          expiresIn: emailLongDate(expiresAt, locale),
        })
        const sent = await sendEmail(email, template).catch(() => ({ success: false, postalMessageId: null }))
        await invitesCol.updateOne(
          { id: inviteId },
          {
            $set: {
              delivery_status: sent.success ? 'sent' : 'failed',
              delivery_updated_at: nowIso(),
              ...(sent.postalMessageId ? { postal_message_id: sent.postalMessageId } : {}),
              ...(sent.success ? {} : { delivery_error: 'Invite email could not be sent' }),
            },
          },
        )
        if (sent.success) emailed++
        else errors.push(`${email}: invite created but the email could not be sent`)
      } catch (e: unknown) {
        skipped++
        console.error('[advance] invite failed:', e)
        errors.push(`${email}: failed`)
      }
    }

    return NextResponse.json({
      advanced,
      emailed,
      skipped,
      passers: passers.length,
      target: { id: targetExamId, title: targetTitle },
      errors: errors.slice(0, 10),
    })
  } catch (e: unknown) {
    const msg = 'Advance failed'
    console.error('[CodeSpectra] advance POST:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
