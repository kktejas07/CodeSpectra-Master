import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { buildFeed } from '@/lib/calendar/feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'user_calendar_events'

/**
 * Hackathons (team member) and codeathons (registered or on a team) the user
 * takes part in — published only, and only the user's own participation.
 */
async function participationFeed(db: Awaited<ReturnType<typeof getMongoDb>>, userId: string) {
  const [teams, regs, cMembers] = await Promise.all([
    db.collection('hackathon_teams').find({ 'members.user_id': userId }, { projection: { hackathon_id: 1 } }).limit(200).toArray(),
    db.collection('codeathon_registrations').find({ user_id: userId }, { projection: { codeathon_id: 1 } }).limit(200).toArray(),
    db.collection('codeathon_team_members').find({ user_id: userId }, { projection: { codeathon_id: 1 } }).limit(200).toArray(),
  ])
  const hIds = [...new Set(teams.map((t) => String(t.hackathon_id)))]
  const cIds = [...new Set([...regs, ...cMembers].map((r) => String(r.codeathon_id)))]
  const hProj = { _id: 0, id: 1, slug: 1, name: 1, description: 1, starts_at: 1, ends_at: 1, status: 1, allow_late_submissions: 1, grace_period_minutes: 1, results_released: 1, released_at: 1 }
  const cProj = { _id: 0, id: 1, title: 1, description: 1, startDate: 1, endDate: 1, status: 1 }
  const [hDocs, cDocs] = await Promise.all([
    hIds.length ? db.collection('hackathons').find({ id: { $in: hIds }, status: { $ne: 'draft' } }, { projection: hProj }).toArray() : [],
    cIds.length ? db.collection('codeathons').find({ id: { $in: cIds }, status: { $ne: 'draft' } }, { projection: cProj }).toArray() : [],
  ])
  return buildFeed({ hackathons: hDocs, codeathons: cDocs })
}

/** GET — the signed-in user's own calendar entries plus their hackathon/codeathon dates. */
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
    // The participation feed is best-effort: personal entries still load if it fails.
    const feed = await participationFeed(db, user.id).catch((e) => {
      console.error('[user/calendar] feed', e)
      return []
    })
    return NextResponse.json({
      items: [...items.map(({ _id, ...rest }) => rest), ...feed],
    })
  } catch (e) {
    console.error('[user/calendar]', e)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}

/** Only same-site paths or https links (the page renders them as hrefs). */
function safeUrl(v: unknown): string | null {
  const u = typeof v === 'string' ? v.trim().slice(0, 500) : ''
  if (/^\/(?![\/\\])/.test(u) || /^https:\/\//i.test(u)) return u
  return null
}

/** POST — add one or more events to the in-app calendar (no need to leave CodeSpectra). */
export async function POST(req: NextRequest) {
  const user = await getAPIUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const body = await req.json().catch(() => ({}))
    const events = (Array.isArray(body.events) ? body.events : [body]).slice(0, 50)
    const now = new Date().toISOString()
    const docs = events
      .map((e: any) => {
        const title = String(e?.title || '').trim().slice(0, 200)
        const start = String(e?.start || e?.at || '').trim()
        if (!title || !start || !Number.isFinite(new Date(start).getTime())) return null
        return {
          id: randomUUID(),
          userId: user.id,
          title,
          description: String(e?.description || '').slice(0, 2000),
          start,
          end: e?.end ? String(e.end) : null,
          url: safeUrl(e?.url),
          source: e?.source === 'course' ? 'course' : 'manual',
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
