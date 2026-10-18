import { NextResponse } from 'next/server'
import { getMongoDb } from '@/lib/mongodb'
import { limitRequest } from '@/lib/rate-limit'
import { getAppOrigin } from '@/lib/app-origin'
import { buildIcs } from '@/lib/calendar/ics'
import { eventForExport, type FeedSource } from '@/lib/calendar/feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/calendar/ics?type=hackathon|codeathon&id=<id or hackathon slug>
 * Public single-event .ics download. Published events only; drafts 404 the
 * same as unknown ids so their existence is not revealed.
 */
export async function GET(req: Request) {
  const limited = await limitRequest(req, 'calendar-ics', null, 30, 60_000)
  if (limited) return limited

  const sp = new URL(req.url).searchParams
  const type = sp.get('type')
  const id = (sp.get('id') || '').trim()
  if ((type !== 'hackathon' && type !== 'codeathon') || !id || id.length > 120) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const kind = type as FeedSource
  try {
    const db = await getMongoDb()
    const doc = kind === 'hackathon'
      ? await db.collection('hackathons').findOne(
          { $or: [{ id }, { slug: id }], status: { $ne: 'draft' } },
          { projection: { _id: 0, id: 1, slug: 1, name: 1, description: 1, starts_at: 1, ends_at: 1, status: 1 } },
        )
      : await db.collection('codeathons').findOne(
          { id, status: { $ne: 'draft' } },
          { projection: { _id: 0, id: 1, title: 1, description: 1, startDate: 1, endDate: 1, status: 1 } },
        )
    const ev = doc ? eventForExport(kind, doc, getAppOrigin()) : null
    if (!ev) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const slug = String(ev.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || kind
    return new NextResponse(buildIcs([ev], ev.title), {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${slug}.ics"`,
        'Cache-Control': 'public, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (e) {
    console.error('[calendar/ics]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
