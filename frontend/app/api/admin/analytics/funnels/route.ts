/**
 * GET  /api/admin/analytics/funnels — list funnels
 * POST /api/admin/analytics/funnels — create funnel
 * GET  /api/admin/analytics/funnels/[id] — compute funnel results
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireSuperAdmin } from '@/lib/route-auth'
import { analyticsFunnels, analyticsEvents, newId, nowIso, type FunnelStepResult } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── GET: list funnels or compute results ───────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const funnelId = searchParams.get('id')
  const range = searchParams.get('range') || '7d'

  const col = await analyticsFunnels()

  // Compute results for a specific funnel
  if (funnelId) {
    const funnel = await col.findOne({ id: funnelId })
    if (!funnel) return NextResponse.json({ error: 'Funnel not found' }, { status: 404 })

    const now = new Date()
    let since: Date
    if (range === '30d') since = new Date(now.getTime() - 30 * 86400_000)
    else if (range === '90d') since = new Date(now.getTime() - 90 * 86400_000)
    else since = new Date(now.getTime() - 7 * 86400_000)
    const sinceIso = since.toISOString()

    const eventsCol = await analyticsEvents()

    // For each step, find unique users who completed it (in order)
    const steps: FunnelStepResult[] = []
    let previousUsers: Set<string> = new Set()
    let totalStarters = 0

    for (let i = 0; i < funnel.steps.length; i++) {
      const step = funnel.steps[i]

      // Build match query
      const matchQuery: Record<string, unknown> = {
        timestamp: { $gte: sinceIso },
        event: step.event,
      }
      if (step.path) matchQuery.path = step.path

      // Find unique users for this step
      const userAgg = await eventsCol.aggregate([
        { $match: matchQuery },
        { $group: { _id: { $ifNull: ['$user_id', '$anonymous_id'] }, first_seen: { $min: '$timestamp' } } },
      ]).toArray()

      const currentUsers = new Set(userAgg.map((u: any) => u._id).filter(Boolean))

      if (i === 0) {
        totalStarters = currentUsers.size
        previousUsers = currentUsers
      } else {
        // Intersect: only users who also completed previous steps
        const filtered = new Set<string>()
        for (const uid of currentUsers) {
          if (previousUsers.has(uid)) filtered.add(uid)
        }
        previousUsers = filtered
      }

      const users = previousUsers.size
      const conversionRate = totalStarters > 0 ? Math.round((users / totalStarters) * 10000) / 100 : 0
      const prevUsers = i > 0 ? steps[i - 1].users : totalStarters
      const dropoffRate = prevUsers > 0 ? Math.round(((prevUsers - users) / prevUsers) * 10000) / 100 : 0

      steps.push({
        event: step.event,
        label: step.label || step.event,
        users,
        conversion_rate: conversionRate,
        dropoff_rate: dropoffRate,
      })
    }

    const result = {
      funnel_id: funnelId,
      computed_at: nowIso(),
      period: range,
      steps,
      total_starters: totalStarters,
      total_completers: steps.length > 0 ? steps[steps.length - 1].users : 0,
      completion_rate: totalStarters > 0
        ? Math.round(((steps.length > 0 ? steps[steps.length - 1].users : 0) / totalStarters) * 10000) / 100
        : 0,
    }

    return NextResponse.json(result)
  }

  // List all funnels
  const funnels = await col.find({}).sort({ created_at: -1 }).limit(50).toArray()
  return NextResponse.json({ funnels })
}

// ─── POST: create funnel ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON', code: 'invalid_json' }, { status: 400 })
  }

  const name = String(body.name || '').trim()
  const steps = Array.isArray(body.steps) ? body.steps : []
  const description = String(body.description || '').trim()

  if (!name || steps.length < 2) {
    return NextResponse.json({ error: 'Name and at least 2 steps required' }, { status: 400 })
  }

  const col = await analyticsFunnels()
  const funnel = {
    id: newId(),
    name,
    description: description || undefined,
    steps: steps.map((s: any) => ({
      event: String(s.event || '').trim(),
      path: s.path ? String(s.path).trim() : undefined,
      label: s.label ? String(s.label).trim() : undefined,
    })),
    created_at: nowIso(),
    created_by: gate.user.id,
  }

  await col.insertOne(funnel as any)
  return NextResponse.json({ ok: true, funnel })
}
