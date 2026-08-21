import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { notifications, newId, nowIso } from '@/lib/db/admin'
import { isSuperAdmin } from '@/lib/rbac'
import { isPlatformAdminRoute } from '@/lib/page-permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const col = await notifications()
    const list = await col
      .find({ user_id: user.id })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray()

    const unread = list.filter((n) => !n.is_read).length
    const items = isSuperAdmin(user.role) ? list : list.map(n => {
      const link = typeof n.link === 'string' ? n.link : ''
      return isPlatformAdminRoute(link) ? { ...n, link: '/dashboard/profile' } : n
    })

    return NextResponse.json({ items, unread })
  } catch (error) {
    console.error('[notifications] GET:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
    const doc = {
      id: newId(),
      user_id: user.id,
      title: typeof body.title === 'string' ? body.title : 'Notification',
      message: typeof body.message === 'string' ? body.message : '',
      type: typeof body.type === 'string' ? body.type : 'info',
      link: typeof body.link === 'string' ? body.link : '',
      icon: typeof body.icon === 'string' ? body.icon : 'bell',
      category: typeof body.category === 'string' ? body.category : 'general',
      metadata: (body.metadata || {}) as Record<string, unknown>,
      is_read: false,
      created_at: nowIso(),
    }

    const col = await notifications()
    await col.insertOne(doc)
    return NextResponse.json(doc)
  } catch (error) {
    console.error('[notifications] POST:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
