import { formatDateTime } from '@/lib/format-datetime'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, type APIUser } from '@/lib/route-auth'
import { interviewSessions, createInterviewSession, newId, nowIso } from '@/lib/db/interviews'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { resolveActorFor } from '@/lib/ats/access'
import { profileTenantId } from '@/lib/auth-account'
import { escapeHtml } from '@/lib/safe-html'
import { canScheduleCandidate, normalizeCandidateEmail, CANDIDATE_UNAVAILABLE } from '@/lib/interview-access'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const role = gate.user.role
  const userId = gate.user.id
  const col = await interviewSessions()
  const filter: Record<string, unknown> = role === 'superadmin'
    ? {}
    : role === 'tenant_admin'
      ? (gate.user.tenantId ? { tenant_id: gate.user.tenantId } : { _id: null })
      : { $or: [{ interviewer_id: userId }, { candidate_id: userId }] }

  const items = await col.find(filter).sort({ scheduled_at: -1 }).toArray()
  return NextResponse.json({ items })
}

/**
 * Who may book a live interview for someone else: superadmin, a tenant_admin of
 * an active organisation, or an active hiring-team member (ATS admin, recruiter,
 * hiring manager, interviewer). Ordinary users/candidates can't — before this
 * check any signed-in account could create sessions (and email any user).
 * Candidate practice (AI mock interviews) uses /api/interviews/ai-mock/* and is
 * not affected. Returns the tenant the session belongs to.
 */
async function interviewCreatorTenant(user: APIUser): Promise<{ ok: true; tenantId: string | null } | { ok: false }> {
  if (user.role === 'superadmin') return { ok: true, tenantId: user.tenantId || null }
  if (user.role === 'tenant_admin' && user.tenantId) return { ok: true, tenantId: user.tenantId }
  try {
    const actor = await resolveActorFor(user)
    if (actor && actor.role !== 'client') return { ok: true, tenantId: actor.tenantId }
  } catch (e) {
    console.error('[Interview] ATS membership check failed:', e)
  }
  return { ok: false }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const creator = await interviewCreatorTenant(gate.user)
  if (!creator.ok) {
    return NextResponse.json({ error: 'Only admins and hiring-team members can schedule interviews. To practise, use AI mock interviews.' }, { status: 403 })
  }

  const rateCheck = await rateLimitAIRedis(req, gate.user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }
  // W4-16: candidate lookups by e-mail are capped per user (slows probing).
  const lookupLimited = await limitRequest(req, 'interview-candidate-lookup', gate.user.id, 30, 10 * 60_000)
  if (lookupLimited) return lookupLimited

  const body = await req.json().catch(() => ({})) as {
    title?: string; type?: string; role?: string
    candidate_id?: string; candidate_email?: string; scheduled_at?: string; duration_minutes?: number
    resume_info?: string
  }

  // CORE-015: the candidate is resolved here from an e-mail (company admins and hiring-team
  // members can't list platform users, so the page can no longer look the id up itself).
  const candidateEmail = body.candidate_email !== undefined ? normalizeCandidateEmail(body.candidate_email) : null
  if (body.candidate_email !== undefined && !candidateEmail) {
    return NextResponse.json({ error: 'Enter a valid candidate email.' }, { status: 400 })
  }
  if (!body.title || !body.type || !body.role || (!body.candidate_id && !candidateEmail) || !body.scheduled_at) {
    return NextResponse.json({ error: 'Missing required fields: title, type, role, candidate_email, scheduled_at' }, { status: 400 })
  }

  const validTypes = ['technical', 'behavioral', 'system-design', 'coding']
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }
  if (typeof body.title !== 'string' || typeof body.role !== 'string' || typeof body.scheduled_at !== 'string'
    || (body.candidate_id !== undefined && (typeof body.candidate_id !== 'string' || body.candidate_id.length > 128))
    || body.title.length > 200 || body.role.length > 200 || Number.isNaN(Date.parse(body.scheduled_at))) {
    return NextResponse.json({ error: 'Invalid interview details' }, { status: 400 })
  }
  // The candidate must be a real account (and, for tenant staff, not another tenant's member).
  const users = (await getMongoDb()).collection('user')
  const projection = { id: 1, email: 1, tenantId: 1, organizationId: 1 }
  const candidateDoc = candidateEmail
    ? (await users.findOne({ email: candidateEmail }, { projection }))
      ?? (await users.findOne({ email: { $regex: `^${candidateEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' } }, { projection }))
    : await users.findOne({ id: body.candidate_id }, { projection })
  // W4-16: one generic answer for "no account", "another organisation's member"
  // and a bad id — it must not tell the caller whether an email is registered.
  const notFound = CANDIDATE_UNAVAILABLE
  if (!candidateDoc?.id) return NextResponse.json({ error: notFound }, { status: 404 })
  const candidateTenant = profileTenantId(candidateDoc as Parameters<typeof profileTenantId>[0])
  if (!canScheduleCandidate({ role: gate.user.role, tenantId: creator.tenantId }, candidateTenant)) {
    return NextResponse.json({ error: notFound }, { status: 404 })
  }
  body.candidate_id = String(candidateDoc.id)
  if (body.candidate_id === gate.user.id) {
    return NextResponse.json({ error: "You can't interview yourself. To practise, use AI mock interviews." }, { status: 400 })
  }
  if (typeof body.resume_info === 'string') body.resume_info = body.resume_info.slice(0, 20000)

  const session = await createInterviewSession({
    title: body.title,
    type: body.type as any,
    role: body.role,
    interviewer_id: gate.user.id,
    candidate_id: body.candidate_id!,
    scheduled_at: new Date(body.scheduled_at).toISOString(),
    duration_minutes: Math.min(180, Math.max(15, body.duration_minutes || 60)),
    resume_info: body.resume_info,
    tenant_id: creator.tenantId,
  })

  // Workflow event with the candidate's name + email (lib/automation/interview-events, AUTO-021).
  void import('@/lib/automation/interview-events').then(({ emitInterviewScheduled }) => emitInterviewScheduled(session)).catch((e) => console.error('[automation] emit failed:', e))

  // Pin to calendar for interviewer + candidate
  try {
    const db = await getMongoDb()
    const calCol = db.collection('user_calendar_events')
    const start = new Date(session.scheduled_at)
    const end = new Date(start.getTime() + session.duration_minutes * 60_000)
    const liveUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/interviews/${session.id}/live`
    const now = new Date().toISOString()

    await calCol.insertMany([
      {
        id: newId(), userId: session.interviewer_id, title: `Interview: ${session.title}`,
        description: '', start: start.toISOString(), end: end.toISOString(),
        url: liveUrl, source: 'interview', createdAt: now,
      },
      {
        id: newId(), userId: session.candidate_id, title: `Interview: ${session.title}`,
        description: '', start: start.toISOString(), end: end.toISOString(),
        url: liveUrl, source: 'interview', createdAt: now,
      },
    ])
  } catch (e) {
    console.error('[Interview] Calendar pin failed:', e)
  }

  // Send candidate email
  try {
    const db = await getMongoDb()
    const candidate = await db.collection('user').findOne({ id: session.candidate_id })
    if (candidate?.email) {
      const liveUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard/interviews/${session.id}/live`
      const startTime = formatDateTime(session.scheduled_at)
      await sendEmail(candidate.email, {
        subject: `Interview Scheduled: ${session.title.replace(/[\r\n]+/g, ' ')}`,
        html: `<p>You have been scheduled for an interview.</p>
<p><strong>Title:</strong> ${escapeHtml(session.title)}</p>
<p><strong>Role:</strong> ${escapeHtml(session.role)}</p>
<p><strong>Type:</strong> ${escapeHtml(session.type)}</p>
<p><strong>When:</strong> ${startTime}</p>
<p><strong>Duration:</strong> ${session.duration_minutes} minutes</p>
<p><a href="${liveUrl}">Join Live Interview →</a></p>`,
      })
    }
  } catch (e) {
    console.error('[Interview] Candidate email failed:', e)
  }

  return NextResponse.json(session, { status: 201 })
}
