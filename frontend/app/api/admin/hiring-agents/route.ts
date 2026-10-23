/**
 * GET   /api/admin/hiring-agents[?tenant=]  settings, usage and last run per agent, the caller's
 *                                           pending agent proposals, run log, integrity queue, author queue
 * PATCH /api/admin/hiring-agents[?tenant=]  { loop, patch } — switch on/off, auto-send steps, caps, params
 *
 * Organisation admins (tenant_admin) for their organisation; superadmin with ?tenant=.
 * Proposals are confirmed through /api/admin/agent/actions/[id]/confirm (re-auth, re-validation, ledger).
 */
import { NextResponse } from 'next/server'
import { readJson } from '@/lib/agent/http'
import { hiringAgentsGate } from '@/lib/agent/hiring-loops/http'
import { cleanSettingsPatch, defaultSettings, isLoopId, LOOP_IDS, LOOP_STEPS } from '@/lib/agent/hiring-loops/types'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const gate = await hiringAgentsGate(req)
  if ('response' in gate) return gate.response
  const { caller, tenantId } = gate
  const store = await import('@/lib/agent/hiring-loops/store')
  const now = new Date()
  const [last, runs, cases, requests, ...rows] = await Promise.all([
    store.lastRuns(tenantId),
    store.listRuns(tenantId, 40),
    (await store.casesCol()).find({ tenant_id: tenantId, priority: { $gt: 0 } }, { projection: { _id: 1, target_kind: 1, target_id: 1, target_title: 1, user_id: 1, name: 1, priority: 1, recommendation: 1, summary: 1, held: 1, released: 1, action_id: 1, updated_at: 1 } }).sort({ priority: -1 }).limit(50).toArray(),
    (await store.authorRequests()).find({ tenant_id: tenantId }, { projection: { _id: 0, id: 1, status: 1, title: 1, job_id: 1, message: 1, action_id: 1, report: 1, created_at: 1, updated_at: 1 } }).sort({ created_at: -1 }).limit(20).toArray(),
    ...LOOP_IDS.map(async (l) => ({ l, s: await store.getLoopSettings(tenantId, l), u: await store.usageSoFar(tenantId, l, now) })),
  ])
  const { getMongoDb } = await import('@/lib/mongodb')
  const { actionScope, expireStaleActions } = await import('@/lib/agent/store')
  await expireStaleActions(now).catch(() => 0)
  const pending = await (await getMongoDb()).collection('agent_actions').find(
    { ...actionScope(caller), tenant_id: tenantId, status: 'pending', 'preview.drafted_by': { $regex: '^hiring-agent-' } },
    { projection: { _id: 0, id: 1, tool: 1, risk: 1, title: 1, preview: 1, created_at: 1, expires_at: 1, conversationId: 1 } },
  ).sort({ created_at: -1 }).limit(100).toArray()
  return NextResponse.json({
    tenant_id: tenantId,
    agents: rows.map(({ l, s, u }) => ({
      loop: l, settings: s.settings, steps: LOOP_STEPS[l], default_enabled: defaultSettings(l).enabled,
      owner_name: s.owner_name, owner_is_you: s.owner_id === caller.userId, has_owner: !!s.owner_id,
      usage: { items_today: u.itemsToday, spent_month_usd: u.spentMonth }, last_run: last[l] ?? null,
    })),
    pending,
    runs,
    cases: cases.map(({ _id, ...c }) => ({ id: String(_id), ...c })),
    requests,
  }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(req: Request) {
  const gate = await hiringAgentsGate(req)
  if ('response' in gate) return gate.response
  const body = await readJson(req)
  if (!body || !isLoopId(body.loop)) return NextResponse.json({ error: 'Invalid request', code: 'invalid_request' }, { status: 400 })
  const clean = cleanSettingsPatch(body.loop, body.patch)
  if (!clean.ok) return NextResponse.json({ error: clean.error, code: 'invalid_request' }, { status: 400 })
  const { saveLoopSettings } = await import('@/lib/agent/hiring-loops/store')
  const saved = await saveLoopSettings(gate.tenantId, body.loop, clean.patch, { id: gate.caller.userId, name: gate.caller.name })
  const { auditAgent } = await import('@/lib/agent/http')
  await auditAgent({ id: gate.caller.userId }, 'hiring_agent.settings', `${gate.tenantId}:${body.loop}`, JSON.stringify(clean.patch).slice(0, 500), clean.patch.auto_send && Object.values(clean.patch.auto_send).some(Boolean) ? 'warning' : 'info').catch(() => undefined)
  return NextResponse.json({ settings: saved.settings, owner_name: saved.owner_name })
}
