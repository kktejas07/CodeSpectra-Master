import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getAPIUser } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { bookingEntries, buildFeed, interviewEntries, inviteDeadlineEntries, savedEventEntries, type FeedEntry } from '@/lib/calendar/feed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COL = 'user_calendar_events'

/**
 * Hackathons (team member) and codeathons (registered or on a team) the user
 * takes part in — published only, and only the user's own participation.
 */
/**
 * CORE-007: interviews (standalone + hiring panel), assessment invite deadlines,
 * booked marketplace sessions and events saved from the events feed. Each
 * source is bounded and best-effort.
 */
async function otherFeed(db: Awaited<ReturnType<typeof getMongoDb>>, user: { id: string; email?: string | null }): Promise<FeedEntry[]> {
  const soon = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const email = (user.email || '').toLowerCase()
  const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[])
  const [standalone, ats, invites, bookings, sub] = await Promise.all([
    safe(db.collection('interviews').find({ $or: [{ candidate_id: user.id }, { interviewer_id: user.id }], scheduled_at: { $gte: soon } }, { projection: { _id: 0, id: 1, title: 1, role: 1, scheduled_at: 1, duration_minutes: 1, status: 1 } }).limit(100).toArray()),
    safe(db.collection('ats_interviews').find({ 'panel.user_id': user.id, scheduled_at: { $gte: soon } }, { projection: { _id: 0, id: 1, scheduled_at: 1, duration_min: 1, status: 1, join_url: 1 } }).limit(100).toArray()),
    email ? safe(db.collection('candidate_invites').find({ email, status: { $in: ['pending', 'active'] }, expires_at: { $gte: new Date().toISOString() } }, { projection: { _id: 0, id: 1, exam_id: 1, expires_at: 1, status: 1, token: 1 } }).limit(50).toArray()) : Promise.resolve([]),
    safe(db.collection('mkt_bookings').find({ buyer_id: user.id, status: 'booked' }, { projection: { _id: 0, id: 1, product_id: 1, order_id: 1, start: 1, end: 1, status: 1 } }).limit(100).toArray()),
    db.collection('subscriptions').findOne({ user_id: user.id }, { projection: { _id: 0, saved_events: 1 } }).catch(() => null),
  ])
  const examIds = [...new Set(invites.map((i) => String(i.exam_id || '')).filter(Boolean))]
  const productIds = [...new Set(bookings.map((b) => String(b.product_id)))]
  const savedIds = Array.isArray(sub?.saved_events) ? (sub!.saved_events as unknown[]).map(String).slice(0, 100) : []
  const [exams, products, events] = await Promise.all([
    examIds.length ? safe(db.collection('exams').find({ id: { $in: examIds } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray()) : Promise.resolve([]),
    productIds.length ? safe(db.collection('mkt_products').find({ id: { $in: productIds } }, { projection: { _id: 0, id: 1, title: 1 } }).toArray()) : Promise.resolve([]),
    savedIds.length ? safe(db.collection('events_feed').find({ id: { $in: savedIds }, status: { $ne: 'hidden' } }, { projection: { _id: 0, id: 1, title: 1, organiser: 1, starts_at: 1, ends_at: 1, registration_deadline: 1 } }).toArray()) : Promise.resolve([]),
  ])
  const titleMap = (rows: Array<Record<string, unknown>>) => Object.fromEntries(rows.map((r) => [String(r.id), String(r.title || '')]))
  return [
    ...interviewEntries(standalone, 'standalone'),
    ...interviewEntries(ats, 'ats'),
    ...inviteDeadlineEntries(invites, titleMap(exams)),
    ...bookingEntries(bookings, titleMap(products)),
    ...savedEventEntries(events),
  ]
}

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

/** Personal entries pinned when an interview was booked already cover it — drop the derived copy. */
function dropPinnedInterviews(feed: FeedEntry[], personal: Array<Record<string, unknown>>): FeedEntry[] {
  const pinned = new Set(personal.filter((p) => p.source === 'interview' && typeof p.url === 'string').map((p) => String(p.url).replace(/^https?:\/\/[^/]+/, '')))
  return feed.filter((e) => !(e.source === 'interview' && pinned.has(e.url)))
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
    const [feed, extra] = await Promise.all([
      participationFeed(db, user.id).catch((e) => {
        console.error('[user/calendar] feed', e)
        return [] as FeedEntry[]
      }),
      otherFeed(db, user).catch((e) => {
        console.error('[user/calendar] other feed', (e as Error)?.message)
        return [] as FeedEntry[]
      }),
    ])
    const personal = items.map(({ _id, ...rest }) => rest)
    return NextResponse.json({
      items: [...personal, ...feed, ...dropPinnedInterviews(extra, personal)],
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
