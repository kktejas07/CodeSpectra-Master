/**
 * POST /api/events-feed/admin/sources — superadmin.
 *  { action: 'toggle', id, enabled, confirm_permission? }
 *  { action: 'add_feed', type: 'rss'|'ical', name, url, kind?, mode?, country? }
 *  { action: 'remove_feed', id }
 *  { action: 'run', only?: string[] }   pull now (all enabled sources, or the listed ones)
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { addFeed, removeFeed, setSourceEnabled } from '@/lib/events-feed/admin'
import { runPull } from '@/lib/events-feed/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const id = typeof b.id === 'string' ? b.id.slice(0, 60) : ''
  switch (b.action) {
    case 'toggle': {
      const r = await setSourceEnabled(id, b.enabled === true, auth.user.id, b.confirm_permission === true)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      await auditAdmin(auth.user, b.enabled ? 'events_feed.source_enable' : 'events_feed.source_disable', 'events_feed_source', id, b.confirm_permission ? 'permission confirmed' : undefined)
      return NextResponse.json({ ok: true })
    }
    case 'add_feed': {
      const r = await addFeed(b)
      if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
      await auditAdmin(auth.user, 'events_feed.feed_add', 'events_feed_source', r.id!)
      return NextResponse.json(r)
    }
    case 'remove_feed': {
      if (!(await removeFeed(id))) return NextResponse.json({ error: 'Only admin-added feeds can be removed' }, { status: 400 })
      await auditAdmin(auth.user, 'events_feed.feed_remove', 'events_feed_source', id)
      return NextResponse.json({ ok: true })
    }
    case 'run': {
      const only = Array.isArray(b.only) ? b.only.filter((x): x is string => typeof x === 'string').slice(0, 30) : undefined
      const report = await runPull({ only })
      await auditAdmin(auth.user, 'events_feed.pull', 'events_feed', only?.join(',') || 'all', `+${report.inserted} new, ${report.updated} updated`)
      return NextResponse.json({ ok: true, report })
    }
    default:
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  }
}
