/**
 * Nudge limits, run log and the content-freshness editor queue (superadmin).
 *   GET  ?automation=<id>             → { settings, log: { rows, week }, freshness: { items, open } }
 *   POST { action: 'settings', settings: { cap_daily?, cap_weekly?, … } }
 *        { action: 'freshness', kind: 'learn'|'question', ref_id, status: 'dismissed'|'done'|'open' }
 * Rows hold ids and outcomes only (no addresses, names or message text).
 */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireSuperAdmin } from '@/lib/route-auth'
import { auditAdmin } from '@/lib/admin-audit'
import { limitRequest } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ID = /^[a-z0-9-]{1,60}$/
const Freshness = z.object({ action: z.literal('freshness'), kind: z.enum(['learn', 'question']), ref_id: z.string().regex(/^[A-Za-z0-9_-]{1,80}$/), status: z.enum(['dismissed', 'done', 'open']) }).strict()
const Settings = z.object({ action: z.literal('settings'), settings: z.record(z.string(), z.unknown()) }).strict()

export async function GET(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const a = req.nextUrl.searchParams.get('automation')
  const automationId = a && ID.test(a) ? a : null
  const [{ getNudgeSettings }, { nudgeLog }, { getMongoDb }] = await Promise.all([import('@/lib/automation/nudges/settings'), import('@/lib/automation/nudges/deliver'), import('@/lib/mongodb')])
  const db = await getMongoDb()
  const queue = db.collection('content_freshness_queue')
  const [settings, log, items, open] = await Promise.all([
    getNudgeSettings(true),
    nudgeLog({ automationId, limit: 50 }),
    queue.find({ status: 'open' }, { projection: { _id: 0 } }).sort({ detected_at: -1 }).limit(50).toArray().catch(() => []),
    queue.countDocuments({ status: 'open' }).catch(() => 0),
  ])
  return NextResponse.json({ settings, log, freshness: { items, open } }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req: NextRequest) {
  const gate = await requireSuperAdmin()
  if ('error' in gate) return NextResponse.json({ error: gate.error }, { status: gate.status })
  const limited = await limitRequest(req, 'admin:automation-nudges', gate.user.id, 60, 60_000)
  if (limited) return limited
  const body = await req.json().catch(() => null)
  const s = Settings.safeParse(body)
  if (s.success) {
    const { saveNudgeSettings } = await import('@/lib/automation/nudges/settings')
    const r = await saveNudgeSettings(s.data.settings, gate.user.id)
    if (!r.ok) return NextResponse.json({ error: r.error, code: 'invalid_request' }, { status: 400 })
    await auditAdmin(gate.user, 'automation.nudges', 'automation', 'nudges', Object.keys(s.data.settings).join(', '), 'warning')
    return NextResponse.json({ ok: true, settings: r.settings })
  }
  const f = Freshness.safeParse(body)
  if (f.success) {
    const { getMongoDb } = await import('@/lib/mongodb')
    const r = await (await getMongoDb()).collection('content_freshness_queue').updateOne({ kind: f.data.kind, ref_id: f.data.ref_id }, { $set: { status: f.data.status, reviewed_by: gate.user.id, reviewed_at: new Date().toISOString() } })
    if (!r.matchedCount) return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'unknown action', code: 'unknown_action' }, { status: 400 })
}
