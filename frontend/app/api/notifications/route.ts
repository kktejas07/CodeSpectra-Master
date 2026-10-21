import { NextRequest, NextResponse } from 'next/server'
import { getAPIUser } from '@/lib/route-auth'
import { notifications, newId, nowIso } from '@/lib/db/admin'
import { isSuperAdmin } from '@/lib/rbac'
import { isPlatformAdminRoute } from '@/lib/page-permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/notifications[?before=<created_at>&limit=N] — newest first, N ≤ 100 (default 100).
 * `before` pages to older ones (CORE-008); `has_more` says whether there are more.
 * `unread` counts all unread notifications, not just this page.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const before = sp.get('before')
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit')) || 100))
    const filter: Record<string, unknown> = { user_id: user.id }
    if (before && !Number.isNaN(Date.parse(before))) filter.created_at = { $lt: before }

    const col = await notifications()
    const [rows, unread] = await Promise.all([
      col.find(filter as never).sort({ created_at: -1 }).limit(limit + 1).toArray(),
      col.countDocuments({ user_id: user.id, is_read: { $ne: true } } as never),
    ])
    const has_more = rows.length > limit
    const list = rows.slice(0, limit)
    const items = isSuperAdmin(user.role) ? list : list.map(n => {
      const link = typeof n.link === 'string' ? n.link : ''
      return isPlatformAdminRoute(link) ? { ...n, link: '/dashboard/profile' } : n
    })

    return NextResponse.json({ items, unread, has_more, next_before: has_more ? list[list.length - 1]?.created_at ?? null : null })
  } catch (error) {
    console.error('[notifications] GET:', error)
    return NextResponse.json({ error: 'Could not load notifications' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAPIUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized', code: 'unauthorized' }, { status: 401 })

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
    return NextResponse.json({ error: 'Something went wrong with notifications. Try again.' }, { status: 500 })
  }
}
