/** GET /api/events-feed/:id/ics — "Add to calendar" file for one event. */
import { NextResponse } from 'next/server'
import { buildIcs } from '@/lib/calendar/ics'
import { listPublishedFeed, getFeedEvent } from '@/lib/events-feed/query'
import { toPublic, withUtm } from '@/lib/events-feed/public'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params
  const doc = await getFeedEvent(id).catch(() => null)
  const ev = doc && doc.status !== 'hidden' ? toPublic(doc) : (await listPublishedFeed()).find((e) => e.id === id) || null
  if (!ev || !ev.starts_at) return NextResponse.json({ error: 'Event not found' }, { status: 404 })
  const ics = buildIcs([{
    uid: `${ev.id}@codespectra.ai`,
    title: ev.title,
    start: ev.starts_at,
    end: ev.ends_at || undefined,
    url: withUtm(ev.url, ev.internal, 'calendar'),
    location: ev.mode === 'online' ? 'Online' : [ev.city, ev.country].filter(Boolean).join(', ') || undefined,
    description: `${ev.summary}\n\nRegister: ${withUtm(ev.url, ev.internal, 'calendar')}`,
  }], 'CodeSpectra events')
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${ev.id}.ics"`,
      'Cache-Control': 'public, max-age=600',
    },
  })
}
