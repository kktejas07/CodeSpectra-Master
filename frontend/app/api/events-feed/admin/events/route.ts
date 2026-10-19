/**
 * GET   /api/events-feed/admin/events?status=&q=&source=  — superadmin list
 * PATCH /api/events-feed/admin/events  { id, status?, featured?, fields? } — hide / feature / edit
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { editEvent, listAdminEvents } from '@/lib/events-feed/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const p = new URL(req.url).searchParams
  const events = await listAdminEvents({ status: p.get('status') || undefined, search: (p.get('q') || '').slice(0, 100), source: p.get('source')?.slice(0, 60) || undefined })
  return NextResponse.json({ events })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof b.id === 'string' && /^ef_[a-f0-9]{16}$/.test(b.id) ? b.id : null
  if (!id) return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
  const r = await editEvent(id, b)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  const what = [b.status && `status=${b.status}`, b.featured !== undefined && `featured=${b.featured}`, b.fields && `fields=${Object.keys(b.fields as object).join('|')}`].filter(Boolean).join(' ')
  await auditAdmin(auth.user, 'events_feed.event_edit', 'events_feed', id, what)
  return NextResponse.json(r)
}
