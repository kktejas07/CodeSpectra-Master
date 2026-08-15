/**
 * POST /api/analytics/replay — Ingest session replay events.
 * GET  /api/admin/analytics/replay — List replays (superadmin).
 * GET  /api/admin/analytics/replay/[id] — Get single replay events.
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/route-auth'
import { getMongoDb } from '@/lib/mongodb'
import { newId, nowIso } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Cap stored events per session. rrweb mousemove sampling (~1/50ms) can push a
// long session past Mongo's 16MB doc limit (error 17419). The cap keeps docs
// bounded; the initial FullSnapshot is preserved separately so replay can boot.
const MAX_EVENTS = 30_000
const SNAPSHOT_TYPE = 2 // rrweb FullSnapshot

// ─── POST: ingest replay events ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let userId: string | null = null
  try {
    const gate = await requireAuth()
    if (!('error' in gate)) userId = gate.user.id
  } catch { /* anonymous OK */ }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const sessionId = String(body.session_id || '')
  const events = Array.isArray(body.events) ? body.events : []
  const page = String(body.page || '')

  if (!sessionId || events.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 })
  }

  try {
    const db = await getMongoDb()
    const col = db.collection('analytics_replays')
    const now = nowIso()

    // Preserve the first FullSnapshot (rrweb needs it to start replaying) and
    // cap the rolling events array so docs stay under Mongo's 16MB limit.
    // Invariant: the events array holds NO FullSnapshots — they live in `snapshot`.
    const fullSnapshots = events.filter(e => (e as { type?: number }).type === SNAPSHOT_TYPE)
    const incremental = events.filter(e => (e as { type?: number }).type !== SNAPSHOT_TYPE)
    const snapshot = fullSnapshots[0] || null

    // Upsert: append events to existing replay doc, or create new one
    const existing = await col.findOne({ session_id: sessionId })
    if (existing) {
      // $slice keeps only the newest MAX_EVENTS — trims oversized docs too.
      await col.updateOne(
        { session_id: sessionId },
        {
          $push: { events: { $each: incremental as any[], $slice: -MAX_EVENTS } } as any,
          $set: {
            last_activity_at: now,
            page,
            ...(existing.snapshot ? {} : snapshot ? { snapshot } : {}),
          },
          $inc: { event_count: incremental.length },
        },
      )
    } else {
      await col.insertOne({
        id: newId(),
        session_id: sessionId,
        user_id: userId || body.user_id || undefined,
        page,
        events: incremental.slice(-MAX_EVENTS),
        snapshot,
        event_count: incremental.length,
        started_at: now,
        last_activity_at: now,
        duration: 0,
      } as any)
    }
    return NextResponse.json({ ok: true, inserted: events.length })
  } catch (e) {
    console.error('[replay] insert error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}

// ─── GET: list replays (superadmin) ─────────────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200)
  const replayId = searchParams.get('id')

  try {
    const db = await getMongoDb()
    const col = db.collection('analytics_replays')

    // Get single replay
    if (replayId) {
      const replay = await col.findOne({ id: replayId })
      if (!replay) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      // Prepend the preserved FullSnapshot (if any). Strip embedded full
      // snapshots from the events array so legacy docs don't duplicate one.
      const stored = (replay.events || []).filter(
        (e: any) => !(replay.snapshot && (e as { type?: number }).type === SNAPSHOT_TYPE),
      )
      const events = replay.snapshot ? [replay.snapshot, ...stored] : stored
      return NextResponse.json({ replay: { ...replay, events } })
    }

    // List replays
    const replays = await col
      .find({})
      .project({ events: 0 }) // exclude events from list for performance
      .sort({ last_activity_at: -1 })
      .limit(limit)
      .toArray()

    const total = await col.countDocuments({})

    return NextResponse.json({ replays, total })
  } catch (e) {
    console.error('[replay] GET error:', e)
    return NextResponse.json({ error: 'Failed to load replays' }, { status: 500 })
  }
}
