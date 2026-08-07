import { NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { sendEmail } from '@/lib/send-email'
import { emailTemplates } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: {
    userId?: string
    template?: string
    title?: string
    level?: string
    source?: string
    score?: number
    scoreLabel?: string
    certificationId?: string
    eventTitle?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.userId) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  if (!body.title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const db = await getMongoDb()
  const userCol = db.collection('user')
  const user = await userCol.findOne({ $or: [{ _id: body.userId }, { id: body.userId }] } as any)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const verifyToken = Buffer.from(
    `${Date.now()}-${Math.random().toString(36).slice(2)}-${body.userId}`
  ).toString('base64url').slice(0, 32)

  const now = new Date().toISOString()
  const attempt = {
    id: crypto.randomUUID(),
    user_id: body.userId,
    certification_id: body.certificationId || 'manual-issue',
    verify_token: verifyToken,
    started_at: now,
    submitted_at: now,
    score: body.score ?? 100,
    passed: true,
    snapshot: {
      name: user.fullName || user.name || user.email?.split('@')[0] || 'User',
      email: user.email || '',
    },
    cert_snapshot: {
      title: body.title,
      level: body.level || 'Certified',
      source: body.source || 'CodeSpectra',
    },
    score_label: body.scoreLabel || undefined,
    issued_by: gate.user.id,
    issued_by_email: gate.user.email,
    template: body.template || 'classic',
    event_title: body.eventTitle || null,
    issued_at: now,
  }

  const attempts = db.collection('certification_attempts')
  await attempts.insertOne(attempt)

  // Send certificate email
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://codespectra.ai'
    const verifyUrl = `${appUrl}/cert/verify/${verifyToken}`
    await sendEmail(
      user.email,
      emailTemplates.certificateEarned({
        name: attempt.snapshot.name,
        title: body.title,
        certUrl: verifyUrl,
      }),
    )
  } catch { /* email best-effort */ }

  return NextResponse.json({
    ok: true,
    certificate: {
      id: attempt.id,
      user: { id: body.userId, name: attempt.snapshot.name, email: user.email },
      template: body.template || 'classic',
      title: body.title,
      level: body.level || 'Certified',
      score: attempt.score,
      verifyToken,
      verifyUrl: `/cert/verify/${verifyToken}`,
      issuedAt: now,
    },
  })
}
