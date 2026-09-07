import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { candidateInvites, newId, nowIso } from '@/lib/db/admin'
import { exams } from '@/lib/db/content'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface BulkCandidate {
  email: string
  name?: string
  company?: string
  role?: string
}

interface BulkRequest {
  examId: string
  candidates: BulkCandidate[]
  deadline?: string
  durationMinutes?: number
  message?: string
}

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  try {
    const body: BulkRequest = await request.json()
    const { examId, candidates, deadline, durationMinutes, message } = body

    if (!examId) {
      return NextResponse.json({ error: 'examId is required' }, { status: 400 })
    }
    if (!candidates?.length) {
      return NextResponse.json({ error: 'At least one candidate is required' }, { status: 400 })
    }

    const examCol = await exams()
    const exam = await examCol.findOne({ id: examId })
    if (!exam) {
      return NextResponse.json({ error: 'Assessment not found' }, { status: 404 })
    }

    const inviteCol = await candidateInvites()
    const now = nowIso()

    // Dedupe by email within the batch + check existing invites for this exam
    const seenEmails = new Set<string>()
    const created: string[] = []
    const errors: { email: string; reason: string }[] = []

    for (const c of candidates) {
      const email = (c.email || '').trim().toLowerCase()

      if (!email || !EMAIL_RE.test(email)) {
        errors.push({ email: c.email || '(empty)', reason: 'Invalid email format' })
        continue
      }

      if (seenEmails.has(email)) {
        errors.push({ email, reason: 'Duplicate email in CSV' })
        continue
      }
      seenEmails.add(email)

      // Check existing invite for same exam
      const existing = await inviteCol.findOne({ email, target_url: { $regex: examId } })
      if (existing) {
        errors.push({ email, reason: 'Already invited to this assessment' })
        continue
      }

      const id = newId()
      const doc = {
        id,
        token: `${examId}-${Date.now()}-${id.slice(0, 8)}`,
        user_id: '',
        email,
        full_name: c.name || email.split('@')[0],
        target_url: `/assessment/${examId}`,
        assigned_assessments: [],
        allowed_languages: [],
        invited_by: gate.user.id,
        status: 'pending' as const,
        expires_at: deadline || new Date(Date.now() + 7 * 86400000).toISOString(),
        created_at: now,
        updated_at: now,
        company: c.company || null,
        role_title: c.role || null,
        duration_minutes: durationMinutes || null,
        custom_message: message || null,
        bulk_scheduled: true,
        exam_id: examId,
      }

      await inviteCol.insertOne(doc)
      created.push(email)

      // Send email — fire-and-forget per candidate, catch individually
      try {
        const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'}/assessment/${examId}?invite=${id}`
        const tpl = emailTemplates.assessmentInvite({
          candidateName: c.name || email.split('@')[0],
          examTitle: exam.title,
          inviteUrl,
          expiresIn: deadline ? new Date(deadline).toLocaleDateString() : '7 days',
        })
        await sendEmail(email, tpl)
      } catch {
        // Don't fail batch on email error — invite is already saved
      }
    }

    return NextResponse.json({
      created: created.length,
      failed: errors.length,
      errors,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Bulk scheduling failed'
    console.error('[Bulk] POST error:', e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
