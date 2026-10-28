import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { notifyMany } from '@/lib/notifications'
import { listAllUsers } from '@/lib/db/admin'
import { normalizeUserRole } from '@/lib/rbac'
import { getMongoDb } from '@/lib/mongodb'
import { sanitizeArticleHtml, safeHttpUrl } from '@/lib/safe-html'
import { auditAdmin } from '@/lib/admin-audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AnnouncementTarget = 'all' | 'user' | 'tenant_admin' | 'superadmin'

export async function POST(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  let body: {
    title?: string
    message?: string
    link?: string
    target?: AnnouncementTarget
    send_email?: boolean
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  const message = typeof body?.message === 'string' ? sanitizeArticleHtml(body.message.trim().slice(0, 5000)) : ''
  // Link: same-site path or http(s) only (D29).
  const rawLink = typeof body?.link === 'string' ? body.link.trim() : ''
  const link = rawLink ? safeHttpUrl(rawLink) : null
  if (rawLink && !link) {
    return NextResponse.json({ error: 'Link must be a page path (/…) or an http(s) URL' }, { status: 400 })
  }

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message are required' }, { status: 400 })
  }

  const target: AnnouncementTarget = ['all', 'user', 'tenant_admin', 'superadmin'].includes(body?.target || '')
    ? (body.target as AnnouncementTarget)
    : 'all'

  const sendEmail = Boolean(body.send_email)

  // Idempotency: the same announcement to the same audience within 2 minutes
  // is treated as a double submit.
  const db = await getMongoDb()
  const announcements = db.collection('announcements')
  const recent = await announcements.findOne({
    title, message, target, created_at: { $gte: new Date(Date.now() - 120_000).toISOString() },
  })
  if (recent) return NextResponse.json({ error: 'This announcement was just sent.' }, { status: 409 })

  const allUsers = await listAllUsers()

  let userIds: string[]
  if (target === 'all') {
    userIds = allUsers.map(u => u.id || String(u._id)).filter(Boolean)
  } else {
    userIds = allUsers
      .filter(u => normalizeUserRole(u.role) === target)
      .map(u => u.id || String(u._id))
      .filter(Boolean)
  }

  if (userIds.length === 0) {
    return NextResponse.json({ error: 'No users match the target audience' }, { status: 400 })
  }

  const notified = await notifyMany(userIds, {
    type: 'system.announcement',
    title,
    message,
    link: link || undefined,
    send_email: sendEmail,
  })

  // One history row per announcement (not one per recipient).
  await announcements.insertOne({
    id: crypto.randomUUID(),
    title,
    message,
    link: link || null,
    target,
    channels: { in_app: true, email: sendEmail },
    sent: notified,
    created_by: gate.user.id,
    created_at: new Date().toISOString(),
  })
  await auditAdmin(gate.user, 'admin.announcement.send', 'announcement', `target/${target}`, `${title} (${notified})`)

  return NextResponse.json({ ok: true, sent: notified, target })
}

export async function GET(request: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status })
  }

  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const offset = parseInt(searchParams.get('offset') || '0')

  const col = (await getMongoDb()).collection('announcements')
  const docs = await col
    .find({}, { projection: { _id: 0 } })
    .sort({ created_at: -1 })
    .skip(Math.max(0, offset || 0))
    .limit(limit)
    .toArray()
  const total = await col.countDocuments({})

  return NextResponse.json({ announcements: docs, total, limit, offset })
}