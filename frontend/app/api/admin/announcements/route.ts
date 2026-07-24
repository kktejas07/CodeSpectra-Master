import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { notifyMany } from '@/lib/notifications'
import { listAllUsers } from '@/lib/db/admin'
import { normalizeUserRole } from '@/lib/rbac'

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
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const message = typeof body?.message === 'string' ? body.message.trim() : ''

  if (!title || !message) {
    return NextResponse.json({ error: 'title and message are required' }, { status: 400 })
  }

  const target: AnnouncementTarget = ['all', 'user', 'tenant_admin', 'superadmin'].includes(body?.target || '')
    ? (body.target as AnnouncementTarget)
    : 'all'

  const sendEmail = Boolean(body.send_email)

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
    link: typeof body?.link === 'string' ? body.link.trim() : undefined,
    send_email: sendEmail,
  })

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

  const { notifications } = await import('@/lib/db/admin')
  const col = await notifications()
  const docs = await col
    .find({ type: 'system.announcement' })
    .sort({ created_at: -1 })
    .skip(offset)
    .limit(limit)
    .toArray()

  const total = await col.countDocuments({ type: 'system.announcement' })

  return NextResponse.json({ announcements: docs, total, limit, offset })
}