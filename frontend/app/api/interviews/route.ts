import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/route-auth'
import { interviewSessions, createInterviewSession, newId, nowIso } from '@/lib/db/interviews'
import { rateLimitAIRedis } from '@/lib/upstash-rate-limit'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'

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

export async function POST(req: NextRequest) {
  const gate = await requireAuth()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const rateCheck = await rateLimitAIRedis(req, gate.user.id)
  if (!rateCheck.ok) {
    return NextResponse.json({ error: `Rate limit. Try in ${rateCheck.retryAfterSec}s.` }, { status: 429 })
  }

  const body = await req.json().catch(() => ({})) as {
    title?: string; type?: string; role?: string
    candidate_id?: string; scheduled_at?: string; duration_minutes?: number
    resume_info?: string
  }

  if (!body.title || !body.type || !body.role || !body.candidate_id || !body.scheduled_at) {
    return NextResponse.json({ error: 'Missing required fields: title, type, role, candidate_id, scheduled_at' }, { status: 400 })
  }

  const validTypes = ['technical', 'behavioral', 'system-design', 'coding']
  if (!validTypes.includes(body.type)) {
    return NextResponse.json({ error: `type must be one of: ${validTypes.join(', ')}` }, { status: 400 })
  }

  const session = await createInterviewSession({
    title: body.title,
    type: body.type as any,
    role: body.role,
    interviewer_id: gate.user.id,
    candidate_id: body.candidate_id,
    scheduled_at: body.scheduled_at,
    duration_minutes: Math.min(180, Math.max(15, body.duration_minutes || 60)),
    resume_info: body.resume_info,
    tenant_id: gate.user.tenantId || null,
  })

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
      const startTime = new Date(session.scheduled_at).toLocaleString()
      await sendEmail(candidate.email, {
        subject: `Interview Scheduled: ${session.title}`,
        html: `<p>You have been scheduled for an interview.</p>
<p><strong>Title:</strong> ${session.title}</p>
<p><strong>Role:</strong> ${session.role}</p>
<p><strong>Type:</strong> ${session.type}</p>
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
