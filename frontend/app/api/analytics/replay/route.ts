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

    // Upsert: append events to existing replay doc, or create new one
    const existing = await col.findOne({ session_id: sessionId })
    if (existing) {
      await col.updateOne(
        { session_id: sessionId },
        {
          $push: { events: { $each: events as any[] } } as any,
          $set: { last_activity_at: now, page },
          $inc: { event_count: events.length },
        },
      )
    } else {
      await col.insertOne({
        id: newId(),
        session_id: sessionId,
        user_id: userId || body.user_id || undefined,
        page,
        events,
        event_count: events.length,
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
      return NextResponse.json({ replay })
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
