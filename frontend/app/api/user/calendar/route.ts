import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'user_calendar_events'

/** GET — list the signed-in user's CodeSpectra calendar events. */
export async function GET() {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const db = await getMongoDb()
    const items = await db
      .collection(COL)
      .find({ userId: user.id })
      .sort({ start: 1 })
      .limit(200)
      .toArray()
    return NextResponse.json({
      items: items.map(({ _id, ...rest }) => rest),
    })
  } catch (e) {
    console.error('[user/calendar]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/** POST — add one or more events to the in-app calendar (no need to leave CodeSpectra). */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const events = Array.isArray(body.events) ? body.events : [body]
    const now = new Date().toISOString()
    const docs = events
      .map((e: any) => {
        const title = String(e?.title || '').trim()
        const start = String(e?.start || e?.at || '').trim()
        if (!title || !start) return null
        return {
          id: randomUUID(),
          userId: user.id,
          title,
          description: String(e?.description || ''),
          start,
          end: e?.end ? String(e.end) : null,
          url: e?.url ? String(e.url) : null,
          source: e?.source ? String(e.source) : 'manual',
          createdAt: now,
        }
      })
      .filter(Boolean)
    if (!docs.length) {
      return NextResponse.json({ error: 'No valid events' }, { status: 400 })
    }
    const db = await getMongoDb()
    await db.collection(COL).insertMany(docs as any[])
    return NextResponse.json({ ok: true, items: docs })
  } catch (e) {
    console.error('[user/calendar]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/** DELETE — remove an event by id. */
export async function DELETE(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const id = new URL(req.url).searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = await getMongoDb()
    await db.collection(COL).deleteOne({ userId: user.id, id })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[user/calendar]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
