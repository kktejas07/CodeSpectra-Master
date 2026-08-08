/**
 * POST /api/analytics/ai — Ingest AI usage event.
 * GET  /api/admin/analytics/ai — Query AI analytics (superadmin).
 */
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, requireSuperAdmin } from '@/lib/route-auth'
import { analyticsAiUsage, newId, nowIso } from '@/lib/db/analytics'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── POST: ingest AI usage ──────────────────────────────────────────────────

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

  const col = await analyticsAiUsage()
  const doc = {
    id: newId(),
    user_id: userId || (body.user_id as string) || undefined,
    feature: String(body.feature || 'unknown').slice(0, 64),
    provider: String(body.provider || 'unknown').slice(0, 32),
    model: String(body.model || 'unknown').slice(0, 64),
    input_tokens: Number(body.input_tokens) || 0,
    output_tokens: Number(body.output_tokens) || 0,
    total_tokens: Number(body.total_tokens) || 0,
    estimated_cost: Number(body.estimated_cost) || 0,
    latency_ms: Number(body.latency_ms) || 0,
    success: body.success !== false,
    error: body.error ? String(body.error).slice(0, 256) : undefined,
    timestamp: nowIso(),
  }

  try {
    await col.insertOne(doc as any)
  } catch (e) {
    console.error('[ai analytics] insert error:', e)
  }

  return NextResponse.json({ ok: true })
}

// ─── GET: query AI analytics (superadmin) ───────────────────────────────────

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })

  const { searchParams } = new URL(req.url)
  const range = searchParams.get('range') || '7d'
  const now = new Date()
  let since: Date
  if (range === '30d') since = new Date(now.getTime() - 30 * 86400_000)
  else if (range === '24h') since = new Date(now.getTime() - 24 * 3600_000)
  else since = new Date(now.getTime() - 7 * 86400_000)
  const sinceIso = since.toISOString()

  const col = await analyticsAiUsage()
  const match = { timestamp: { $gte: sinceIso } }

  try {
    const [totalRequests, successful, failed, byModel, byFeature, byProvider, hourly, totals] = await Promise.all([
      col.countDocuments(match),
      col.countDocuments({ ...match, success: true }),
      col.countDocuments({ ...match, success: false }),
      col.aggregate([
        { $match: match },
        { $group: { _id: '$model', requests: { $sum: 1 }, tokens: { $sum: '$total_tokens' }, cost: { $sum: '$estimated_cost' }, avgLatency: { $avg: '$latency_ms' } } },
        { $sort: { requests: -1 } },
        { $limit: 10 },
      ]).toArray(),
      col.aggregate([
        { $match: match },
        { $group: { _id: '$feature', requests: { $sum: 1 }, tokens: { $sum: '$total_tokens' }, cost: { $sum: '$estimated_cost' } } },
        { $sort: { requests: -1 } },
        { $limit: 10 },
      ]).toArray(),
      col.aggregate([
        { $match: match },
        { $group: { _id: '$provider', requests: { $sum: 1 }, tokens: { $sum: '$total_tokens' }, cost: { $sum: '$estimated_cost' } } },
        { $sort: { requests: -1 } },
      ]).toArray(),
      col.aggregate([
        { $match: { timestamp: { $gte: new Date(now.getTime() - 24 * 3600_000).toISOString() } } },
        { $group: { _id: { $substr: ['$timestamp', 0, 13] }, requests: { $sum: 1 }, tokens: { $sum: '$total_tokens' } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      col.aggregate([
        { $match: match },
        { $group: { _id: null, totalTokens: { $sum: '$total_tokens' }, totalCost: { $sum: '$estimated_cost' }, avgLatency: { $avg: '$latency_ms' } } },
      ]).toArray(),
    ])

    return NextResponse.json({
      totalRequests,
      successful,
      failed,
      successRate: totalRequests > 0 ? Math.round((successful / totalRequests) * 10000) / 100 : 0,
      totalTokens: totals[0]?.totalTokens || 0,
      totalCost: Math.round((totals[0]?.totalCost || 0) * 100) / 100,
      avgLatency: Math.round(totals[0]?.avgLatency || 0),
      byModel: byModel.map(m => ({ model: m._id, requests: m.requests, tokens: m.tokens, cost: Math.round(m.cost * 100) / 100, avgLatency: Math.round(m.avgLatency) })),
      byFeature: byFeature.map(f => ({ feature: f._id, requests: f.requests, tokens: f.tokens, cost: Math.round(f.cost * 100) / 100 })),
      byProvider: byProvider.map(p => ({ provider: p._id, requests: p.requests, tokens: p.tokens, cost: Math.round(p.cost * 100) / 100 })),
      hourly: hourly.map(h => ({ hour: h._id, requests: h.requests, tokens: h.tokens })),
      range,
    })
  } catch (e) {
    console.error('[ai analytics] error:', e)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
